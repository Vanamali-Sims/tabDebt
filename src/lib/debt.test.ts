import { describe, expect, it } from 'vitest';
import { bucketOf, summarize, tagOf, FORGOTTEN_AFTER_MS, IDLE_AFTER_MS } from './debt';
import type { TabRecord } from './types';

const now = 1_000_000_000_000;
const tab = (id: string, ago: number, over: Partial<TabRecord> = {}): TabRecord => ({
  id, tabId: 1, url: `https://${id}.com`, title: id, pinned: false, audible: false, openedAt: 0, lastActiveAt: now - ago, activeMs: 120_000, visits: 1, ...over,
});

describe('bucketOf', () => {
  it('splits at one hour and one day', () => {
    expect(bucketOf(now - IDLE_AFTER_MS + 1, now)).toBe('active');
    expect(bucketOf(now - IDLE_AFTER_MS, now)).toBe('idle');
    expect(bucketOf(now - FORGOTTEN_AFTER_MS + 1, now)).toBe('idle');
    expect(bucketOf(now - FORGOTTEN_AFTER_MS, now)).toBe('forgotten');
  });
});

describe('tagOf', () => {
  it('picks one tag, in priority order', () => {
    expect(tagOf({ activeMs: 3000, visits: 9 })).toBe('never read');
    expect(tagOf({ activeMs: 30_000, visits: 9 })).toBe('skimmed');
    expect(tagOf({ activeMs: 90_000, visits: 5 })).toBe('keeps coming back');
    expect(tagOf({ activeMs: 90_000, visits: 4 })).toBeNull();
  });
});

describe('summarize', () => {
  it('leaves the current tab out of the debt and the sections', () => {
    const s = summarize([tab('me', 0), tab('a', 1000), tab('b', 2 * IDLE_AFTER_MS), tab('c', 3 * FORGOTTEN_AFTER_MS)], 'me', now);
    expect(s.debt).toBe(3);
    expect(s.current?.id).toBe('me');
    expect(s.active.map((t) => t.id)).toEqual(['a']);
    expect(s.idle.map((t) => t.id)).toEqual(['b']);
    expect(s.forgotten.map((t) => t.id)).toEqual(['c']);
    expect(s.overAnHour).toBe(2);
  });
  it('sorts debt stalest first and active newest first', () => {
    const s = summarize([tab('x', 2 * IDLE_AFTER_MS), tab('y', 3 * IDLE_AFTER_MS), tab('p', 5000), tab('q', 1000)], undefined, now);
    expect(s.idle.map((t) => t.id)).toEqual(['y', 'x']);
    expect(s.active.map((t) => t.id)).toEqual(['q', 'p']);
  });
});
