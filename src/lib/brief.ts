import { dayKey } from './snapshots';
import { hostOf } from './format';
import type { TabRecord } from './types';

/**
 * What tomorrow morning shows: the thing to pick up first and a few counts. Written in the evening,
 * when the person wraps up or simply leaves, so the morning view needs no AI call and works offline.
 */
export interface Brief {
  createdAt: number;
  /** Local day the brief was written, e.g. 2026-11-01. The morning view shows it on a later day. */
  day: string;
  /** wrapped: they ran a review. unreviewed: they left (locked the screen or closed the browser) first. */
  kind: 'wrapped' | 'unreviewed';
  pickUp?: PickUp;
  /** Tabs still open when the brief was written. */
  openCount: number;
  /** Tabs the evening review closed. */
  closedCount: number;
  runId?: string;
  dismissedAt?: number;
}

export interface PickUp {
  title: string;
  tabs: { url: string; title: string; favIconUrl?: string }[];
}

const HOUR = 3_600_000;
/** Only tabs used this recently can be "what you were last working on". */
export const PICKUP_RECENT_MS = 3 * HOUR;
/** Related tabs come along when they were used within this long of the main one. */
const RELATED_MS = 6 * HOUR;
export const PICKUP_MAX_TABS = 3;
/** Without a known finish time, a review after this hour counts as wrapping up. */
export const EVENING_HOUR = 15;
/** A brief older than this is stale: a long weekend at most. */
export const BRIEF_MAX_AGE_MS = 4 * 24 * HOUR;

const usable = (t: TabRecord) => /^https?:/.test(t.url) && !t.pinned;

/**
 * The tab most worth reopening first: the one used most recently that got real attention, plus up to two
 * tabs that belong with it (opened from it, opened it, or the same site). Null when nothing qualifies.
 */
export function pickUpFrom(open: TabRecord[], now: number, excludeIds: Set<string> = new Set()): PickUp | null {
  const candidates = open.filter((t) => usable(t) && !excludeIds.has(t.id) && now - t.lastActiveAt <= PICKUP_RECENT_MS);
  if (candidates.length === 0) return null;
  // Recency first, then attention: a tab glanced at for two seconds is rarely the work.
  const score = (t: TabRecord) => t.lastActiveAt / HOUR + Math.min(t.activeMs, 30 * 60_000) / (10 * 60_000);
  const main = [...candidates].sort((a, b) => score(b) - score(a))[0]!;
  const related = open
    .filter((t) => t.id !== main.id && usable(t) && !excludeIds.has(t.id) && Math.abs(main.lastActiveAt - t.lastActiveAt) <= RELATED_MS)
    .filter((t) =>
      t.openerRecordId === main.id ||
      main.openerRecordId === t.id ||
      (!!main.openerRecordId && t.openerRecordId === main.openerRecordId) ||
      hostOf(t.url) === hostOf(main.url))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    .slice(0, PICKUP_MAX_TABS - 1);
  const tabs = [main, ...related].map((t) => ({ url: t.url, title: t.title || hostOf(t.url), favIconUrl: t.favIconUrl }));
  return { title: main.title || hostOf(main.url), tabs };
}

/** "github.com + 2 more" under the pick-up title. */
export function pickUpMeta(p: PickUp): string {
  const first = hostOf(p.tabs[0]?.url ?? '');
  return p.tabs.length > 1 ? `${first} + ${p.tabs.length - 1} more` : first;
}

/** Minutes since local midnight. */
export const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

/**
 * True when it is late enough in the day that a review or leaving counts as wrapping up.
 * With a known finish time that means from 45 minutes before it; otherwise from mid-afternoon.
 */
export function isEvening(now: Date, finishMinutes: number | null): boolean {
  const m = minutesOf(now);
  if (finishMinutes === null) return m >= EVENING_HOUR * 60;
  return m >= finishMinutes - 45;
}

/** Whether to open the panel on the morning view. Shown once per brief, on a later day, until dismissed. */
export function shouldShowMorning(brief: Brief | null | undefined, now: Date, enabled = true): boolean {
  if (!enabled || !brief || brief.dismissedAt) return false;
  if (brief.day >= dayKey(now)) return false;
  return now.getTime() - brief.createdAt <= BRIEF_MAX_AGE_MS;
}

/** Leaving should not overwrite a review made earlier the same evening. */
export function shouldWriteUnreviewed(existing: Brief | null | undefined, now: Date): boolean {
  return !(existing && existing.kind === 'wrapped' && existing.day === dayKey(now) && !existing.dismissedAt);
}

export function makeBrief(input: { kind: Brief['kind']; open: TabRecord[]; now: Date; closedCount: number; runId?: string }): Brief {
  const { kind, open, now } = input;
  return {
    createdAt: now.getTime(),
    day: dayKey(now),
    kind,
    pickUp: pickUpFrom(open, now.getTime()) ?? undefined,
    openCount: open.length,
    closedCount: input.closedCount,
    runId: input.runId,
  };
}

/**
 * The brief to keep when the person leaves (locks the screen or closes the browser) in the evening.
 * A review from earlier that evening stays, with its pick-up refreshed to what they did after it.
 */
export function briefOnLeave(existing: Brief | null | undefined, open: TabRecord[], now: Date): Brief {
  if (existing && !shouldWriteUnreviewed(existing, now)) {
    return { ...existing, pickUp: pickUpFrom(open, now.getTime()) ?? existing.pickUp, openCount: open.length };
  }
  return makeBrief({ kind: 'unreviewed', open, now, closedCount: 0 });
}

// ---- Storage ----

export async function loadBrief(): Promise<Brief | null> {
  const { brief } = await chrome.storage.local.get('brief');
  return (brief as Brief | undefined) ?? null;
}

export async function saveBrief(brief: Brief): Promise<void> {
  await chrome.storage.local.set({ brief });
}

export async function dismissBrief(now = Date.now()): Promise<void> {
  const brief = await loadBrief();
  if (brief && !brief.dismissedAt) await saveBrief({ ...brief, dismissedAt: now });
}
