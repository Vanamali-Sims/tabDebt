import { isSearchResults, normalizeUrl } from './rules';
import { dayKey } from './snapshots';

/**
 * Pages you come back to on most days, like a course dashboard or your team board, are home base: there
 * to be used, not finished. Counted per page (not per site), so a daily YouTube habit doesn't keep every
 * video open. Only which days each page was opened is kept, nothing else.
 */
export type PageDays = Record<string, string[]>;

/** Opened on this many of the last 7 days. */
export const HOME_BASE_DAYS = 4;
const WINDOW_DAYS = 7;
const FORGET_AFTER_DAYS = 14;
const MAX_PAGES = 500;

const daysAgo = (now: Date, n: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

/** Pages worth counting: web pages that aren't search results. */
export const countable = (url: string) => /^https?:/i.test(url) && !isSearchResults(url);

/** The record after opening `url` today. Returns the same object when nothing changed. */
export function recordPageDay(days: PageDays, url: string, now: Date = new Date()): PageDays {
  if (!countable(url)) return days;
  const key = normalizeUrl(url);
  const today = dayKey(now);
  if (days[key]?.includes(today)) return days;
  const oldest = daysAgo(now, FORGET_AFTER_DAYS);
  const next: PageDays = {};
  for (const [k, v] of Object.entries(days)) {
    const kept = v.filter((d) => d >= oldest);
    if (kept.length > 0) next[k] = kept;
  }
  next[key] = [...(next[key] ?? []), today].sort().slice(-WINDOW_DAYS);
  // Keep the most recently used pages if the list grows too long.
  const keys = Object.keys(next);
  if (keys.length > MAX_PAGES) {
    keys.sort((a, b) => next[b]!.at(-1)!.localeCompare(next[a]!.at(-1)!));
    for (const k of keys.slice(MAX_PAGES)) delete next[k];
  }
  return next;
}

/** Normalized addresses of pages opened on most of the last 7 days. */
export function homeBasePages(days: PageDays, now: Date = new Date()): Set<string> {
  const since = daysAgo(now, WINDOW_DAYS - 1);
  const out = new Set<string>();
  for (const [k, v] of Object.entries(days)) if (v.filter((d) => d >= since).length >= HOME_BASE_DAYS) out.add(k);
  return out;
}

export async function loadPageDays(): Promise<PageDays> {
  const { pageDays } = await chrome.storage.local.get('pageDays');
  return (pageDays as PageDays | undefined) ?? {};
}

export async function notePageOpened(url: string, now: Date = new Date()): Promise<void> {
  const days = await loadPageDays();
  const next = recordPageDay(days, url, now);
  if (next !== days) await chrome.storage.local.set({ pageDays: next });
}
