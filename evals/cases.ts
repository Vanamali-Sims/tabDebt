import raw from './cases.json';
import type { Action, TabRecord } from '../src/lib/types';

export interface EvalCase {
  id: string;
  title: string;
  url: string;
  expected: Action;
  /** Other answers that are also fine. */
  acceptable?: Action[];
  activeMin: number;
  visits: number;
  lastSeenHours: number;
  pageText?: string;
  note?: string;
}

export const CASES = raw as EvalCase[];
export const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

export const allowed = (c: EvalCase): Action[] => [...new Set([c.expected, ...(c.acceptable ?? [])])];
export const isInjection = (c: EvalCase) => c.id.startsWith('inject-');

export function toRecord(c: EvalCase, index: number): TabRecord {
  return {
    id: c.id,
    tabId: index + 1,
    url: c.url,
    title: c.title,
    pinned: false,
    audible: false,
    openedAt: NOW - (c.lastSeenHours + 4) * HOUR,
    lastActiveAt: NOW - c.lastSeenHours * HOUR,
    activeMs: c.activeMin * 60_000,
    visits: c.visits,
  };
}
