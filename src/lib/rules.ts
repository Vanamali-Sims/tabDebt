import { hostOf } from './format';
import type { MemoryRule, TabRecord, Verdict } from './types';

const DAY = 24 * 3_600_000;

/**
 * Sites the agent never reads or closes. Matched against the address, so this errs on the side of
 * leaving a tab alone. Users can add their own in settings.
 */
export const DEFAULT_EXCLUSIONS = [
  'mail.google.com',
  'outlook.live.com',
  'outlook.office',
  'mail.yahoo.',
  'proton.me',
  'paypal.',
  'bank',
  'mychart',
  'health',
];

export interface RuleContext {
  now: number;
  /** Our record id of the tab the user is looking at right now. */
  activeRecordId?: string;
  exclusions: string[];
  memory: Pick<MemoryRule, 'host' | 'action' | 'count'>[];
  /** Record ids of tabs that other tabs were opened from (open or closed). */
  hasChildren: Set<string>;
}

export function isExcluded(url: string, exclusions: string[]): boolean {
  const u = url.toLowerCase();
  return exclusions.some((e) => e.trim() !== '' && u.includes(e.trim().toLowerCase()));
}

/** Same page, ignoring tracking parameters, fragments and trailing slashes. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_') || ['fbclid', 'gclid', 'ref', 'mc_cid', 'mc_eid'].includes(key)) u.searchParams.delete(key);
    }
    return (u.origin + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  } catch {
    return url;
  }
}

const SEARCH_HOST = /(^|\.)(google|bing|duckduckgo|brave|ecosia|yahoo)\./;
export function isSearchResults(url: string): boolean {
  try {
    const u = new URL(url);
    return SEARCH_HOST.test(u.hostname) && (u.pathname.startsWith('/search') || u.searchParams.has('q') || u.searchParams.has('p'));
  } catch {
    return false;
  }
}

const CONFIRMATION =
  /(order|purchase|payment|booking|reservation|subscription|checkout).{0,40}(confirm|complete|success|receipt)|thank you for your (order|purchase|payment)|(order|booking) (placed|confirmed)/i;
const ERROR_PAGE = /^(404|403|500|502|503)\b|page not found|^not found|access denied|this site can.t be reached|^error\b/i;
const LOGIN_PAGE = /\b(log ?in|sign ?in)\b/i;

const verdict = (r: TabRecord, action: Verdict['action'], reason: string, confidence: number, source: Verdict['source'] = 'rules'): Verdict => ({
  recordId: r.id,
  action,
  reason,
  confidence,
  source,
});

/**
 * The cheap first pass. Anything these rules are sure about never needs the agent; anything
 * they are not sure about is returned as unresolved. Protected tabs are decided first and can
 * never be closed by a later step.
 */
export function classifyByRules(tabs: TabRecord[], ctx: RuleContext): { decided: Verdict[]; unresolved: TabRecord[] } {
  const decided = new Map<string, Verdict>();

  // 1. Never touch.
  for (const t of tabs) {
    if (t.id === ctx.activeRecordId) decided.set(t.id, verdict(t, 'keep', "You're on it now", 1));
    else if (t.pinned) decided.set(t.id, verdict(t, 'keep', 'Pinned', 1));
    else if (t.audible) decided.set(t.id, verdict(t, 'keep', 'Playing audio', 1));
    else if (isExcluded(t.url, ctx.exclusions)) decided.set(t.id, verdict(t, 'keep', 'On your never-look list', 1));
    else if (/compose|draft/i.test(t.url)) decided.set(t.id, verdict(t, 'keep', 'Looks like an unsent draft', 0.9));
  }

  // 2. Things you have told us to keep.
  for (const t of tabs) {
    if (decided.has(t.id)) continue;
    const m = ctx.memory.find((x) => x.host !== '' && x.host === hostOf(t.url));
    if (m) decided.set(t.id, verdict(t, 'keep', `You kept tabs from ${m.host} before`, 0.9, 'memory'));
  }

  // 3. Duplicates: keep the most recently used copy.
  const byUrl = new Map<string, TabRecord[]>();
  for (const t of tabs) {
    const key = normalizeUrl(t.url);
    byUrl.set(key, [...(byUrl.get(key) ?? []), t]);
  }
  for (const group of byUrl.values()) {
    if (group.length < 2) continue;
    const [, ...rest] = [...group].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    for (const t of rest) if (!decided.has(t.id)) decided.set(t.id, verdict(t, 'done', 'Duplicate of another open tab', 0.95));
  }

  // 4. Recognisable finished pages.
  for (const t of tabs) {
    if (decided.has(t.id)) continue;
    const idle = ctx.now - t.lastActiveAt;
    const text = `${t.title} ${t.url}`;
    if (isSearchResults(t.url)) {
      if (ctx.hasChildren.has(t.id)) decided.set(t.id, verdict(t, 'done', "You already opened results from this search", 0.9));
      else if (idle > DAY) decided.set(t.id, verdict(t, 'done', 'Old search you never followed up', 0.8));
    } else if (CONFIRMATION.test(text)) decided.set(t.id, verdict(t, 'done', 'Order or booking already confirmed', 0.85));
    else if (ERROR_PAGE.test(t.title.trim())) decided.set(t.id, verdict(t, 'done', 'Error page', 0.9));
    else if (LOGIN_PAGE.test(t.title) && t.activeMs < 60_000 && idle > DAY) decided.set(t.id, verdict(t, 'done', 'Login page you left behind', 0.7));
  }

  return { decided: [...decided.values()], unresolved: tabs.filter((t) => !decided.has(t.id)) };
}
