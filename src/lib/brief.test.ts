import { describe, expect, it } from 'vitest';
import { isEvening, makeBrief, pickUpFrom, pickUpMeta, shouldShowMorning, shouldWriteUnreviewed, type Brief } from './brief';
import type { TabRecord } from './types';

const H = 3_600_000;
const now = new Date(2026, 10, 1, 18, 0).getTime();
const tab = (id: string, url: string, lastAgoMs: number, extra: Partial<TabRecord> = {}): TabRecord => ({
  id, tabId: 1, url, title: `Title ${id}`, pinned: false, audible: false,
  openedAt: now - 10 * H, lastActiveAt: now - lastAgoMs, activeMs: 10 * 60_000, visits: 2, ...extra,
});

describe('pickUpFrom', () => {
  it('picks the most recent tab that got real attention', () => {
    const p = pickUpFrom([
      tab('a', 'https://github.com/x/pr/48', 5 * 60_000),
      tab('b', 'https://news.example.com/', 2 * 60_000, { activeMs: 2_000 }),
      tab('c', 'https://docs.example.com/', 2 * H),
    ], now);
    expect(p?.title).toBe('Title a');
  });

  it('brings related tabs along, up to three in all', () => {
    const p = pickUpFrom([
      tab('a', 'https://github.com/x/pr/48', 5 * 60_000),
      tab('b', 'https://wxt.dev/storage', 20 * 60_000, { openerRecordId: 'a' }),
      tab('c', 'https://github.com/x/issues', 40 * 60_000),
      tab('d', 'https://github.com/x/wiki', 50 * 60_000),
      tab('e', 'https://unrelated.example.com/', 10 * 60_000),
    ], now);
    expect(p?.tabs.map((t) => t.url)).toEqual(['https://github.com/x/pr/48', 'https://wxt.dev/storage', 'https://github.com/x/issues']);
    expect(pickUpMeta(p!)).toBe('github.com + 2 more');
  });

  it('ignores pinned tabs, browser pages and anything stale', () => {
    expect(pickUpFrom([
      tab('a', 'https://mail.example.com/', 60_000, { pinned: true }),
      tab('b', 'chrome://settings', 60_000),
      tab('c', 'https://old.example.com/', 5 * H),
    ], now)).toBeNull();
  });
});

describe('isEvening', () => {
  it('uses the finish time when known, from 45 minutes before it', () => {
    expect(isEvening(new Date(2026, 10, 1, 17, 0), 17 * 60 + 45)).toBe(true);
    expect(isEvening(new Date(2026, 10, 1, 16, 59), 17 * 60 + 45)).toBe(false);
  });
  it('falls back to mid-afternoon', () => {
    expect(isEvening(new Date(2026, 10, 1, 15, 0), null)).toBe(true);
    expect(isEvening(new Date(2026, 10, 1, 12, 0), null)).toBe(false);
  });
});

describe('shouldShowMorning', () => {
  const brief = makeBrief({ kind: 'wrapped', open: [tab('a', 'https://a.example.com/', 60_000)], now: new Date(now), closedCount: 4 });
  it('shows on a later day only', () => {
    expect(shouldShowMorning(brief, new Date(2026, 10, 1, 22, 0))).toBe(false);
    expect(shouldShowMorning(brief, new Date(2026, 10, 2, 8, 30))).toBe(true);
  });
  it('stays away once dismissed, when turned off, or when stale', () => {
    const next = new Date(2026, 10, 2, 8, 30);
    expect(shouldShowMorning({ ...brief, dismissedAt: next.getTime() }, next)).toBe(false);
    expect(shouldShowMorning(brief, next, false)).toBe(false);
    expect(shouldShowMorning(brief, new Date(2026, 10, 9, 8, 30))).toBe(false);
    expect(shouldShowMorning(null, next)).toBe(false);
  });
});

describe('shouldWriteUnreviewed', () => {
  const at = new Date(now);
  const wrapped: Brief = { createdAt: now, day: '2026-11-01', kind: 'wrapped', openCount: 3, closedCount: 9 };
  it("never overwrites tonight's review", () => {
    expect(shouldWriteUnreviewed(wrapped, at)).toBe(false);
  });
  it('replaces older or unreviewed briefs', () => {
    expect(shouldWriteUnreviewed({ ...wrapped, day: '2026-10-31' }, at)).toBe(true);
    expect(shouldWriteUnreviewed({ ...wrapped, kind: 'unreviewed' }, at)).toBe(true);
    expect(shouldWriteUnreviewed(null, at)).toBe(true);
  });
});
