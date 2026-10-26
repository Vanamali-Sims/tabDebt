import type { TabRecord } from './types';

/** Tweak these to change what counts as idle, forgotten and so on. */
export const IDLE_AFTER_MS = 60 * 60_000;
export const FORGOTTEN_AFTER_MS = 24 * 60 * 60_000;
export const NEVER_READ_MS = 10_000;
export const SKIMMED_MS = 60_000;
export const COMEBACK_VISITS = 5;
export const SNOOZE_MS = 3 * 60 * 60_000;
/** This many tabs from one site collapse into a single row. */
export const GROUP_MIN = 3;

export type Bucket = 'active' | 'idle' | 'forgotten';

export function bucketOf(lastActiveAt: number, now: number): Bucket {
  const age = now - lastActiveAt;
  if (age >= FORGOTTEN_AFTER_MS) return 'forgotten';
  if (age >= IDLE_AFTER_MS) return 'idle';
  return 'active';
}

/** One short, data-derived note about how the tab was used. At most one. */
export function tagOf(tab: Pick<TabRecord, 'activeMs' | 'visits'>): string | null {
  if (tab.activeMs < NEVER_READ_MS) return 'never read';
  if (tab.activeMs < SKIMMED_MS) return 'skimmed';
  if (tab.visits >= COMEBACK_VISITS) return 'keeps coming back';
  return null;
}

export interface DebtSummary {
  /** Open tabs, not counting the one you're on. */
  debt: number;
  active: TabRecord[];
  idle: TabRecord[];
  forgotten: TabRecord[];
  current?: TabRecord;
  /** Idle plus forgotten: everything untouched for over an hour. */
  overAnHour: number;
}

export function summarize(tabs: TabRecord[], currentId: string | undefined, now: number): DebtSummary {
  const current = tabs.find((t) => t.id === currentId);
  const rest = tabs.filter((t) => t.id !== currentId);
  const by = (b: Bucket) => rest.filter((t) => bucketOf(t.lastActiveAt, now) === b);
  const active = by('active').sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  // Debt reads best stalest first.
  const idle = by('idle').sort((a, b) => a.lastActiveAt - b.lastActiveAt);
  const forgotten = by('forgotten').sort((a, b) => a.lastActiveAt - b.lastActiveAt);
  return { debt: rest.length, active, idle, forgotten, current, overAnHour: idle.length + forgotten.length };
}
