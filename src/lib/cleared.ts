import { formatMinutes } from './nudge';
import { dayKey } from './snapshots';
import type { Action, AppliedDecision, Run } from './types';

/**
 * What tabDebt closed, one group per review. Tabs you closed yourself aren't here: that's the browser's
 * history. Undone reviews drop out, since their tabs are open again.
 */
export interface ClearedGroup {
  runId: string;
  at: number;
  /** "Yesterday · 9:41 pm" */
  label: string;
  /** A review, or tabs closed one at a time from the panel. */
  kind: 'review' | 'manual';
  tabs: AppliedDecision[];
  saved: number;
}

const DAY = 24 * 3_600_000;

export function whenLabel(at: number, now: number): string {
  const d = new Date(at);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = formatMinutes(d.getHours() * 60 + d.getMinutes());
  let day: string;
  if (dayKey(d) === dayKey(today)) day = 'Today';
  else if (dayKey(d) === dayKey(yesterday)) day = 'Yesterday';
  else if (now - at < 6 * DAY) day = d.toLocaleDateString('en-AU', { weekday: 'long' });
  else day = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  return `${day} · ${time}`;
}

export function clearedGroups(runs: Run[], now: number): ClearedGroup[] {
  return runs
    .filter((r) => !r.undoneAt && r.applied.length > 0)
    .sort((a, b) => b.at - a.at)
    .map((r) => ({
      runId: r.id,
      at: r.at,
      label: whenLabel(r.at, now),
      kind: r.applied.every((a) => a.source === 'user') ? 'manual' : 'review',
      tabs: r.applied,
      saved: r.applied.filter((a) => a.action !== 'done').length,
    }));
}

/** Tabs cleared in the last week, for the segment count. */
export const clearedThisWeek = (groups: ClearedGroup[], now: number) =>
  groups.filter((g) => now - g.at < 7 * DAY).reduce((n, g) => n + g.tabs.length, 0);

const SAVED_AS: Record<Exclude<Action, 'done' | 'keep'>, string> = { read: 'Saved to Read', task: 'Saved as a task', project: 'Saved to a project' };

/** "Saved to Read · Stopped at 12:40 of 34:00", or just the reason for a tab closed as done. */
export function clearedNote(a: AppliedDecision): string {
  if (a.action === 'done' || a.action === 'keep') return a.reason;
  return `${SAVED_AS[a.action]} · ${a.reason}`;
}
