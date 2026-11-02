import { describe, expect, it } from 'vitest';
import { HOME_BASE_DAYS, homeBasePages, recordPageDay, type PageDays } from './homebase';
import { normalizeUrl } from './rules';

const day = (d: number, h = 10) => new Date(2026, 10, d, h);
const dash = 'https://lms.monash.edu/my/?utm_source=x';

const openOn = (dates: number[], url = dash, start: PageDays = {}) => dates.reduce((acc, d) => recordPageDay(acc, url, day(d)), start);

describe('home base pages', () => {
  it('a page opened on most days this week is home base', () => {
    const days = openOn([2, 3, 4, 5]);
    expect(homeBasePages(days, day(5)).has(normalizeUrl(dash))).toBe(true);
  });
  it('a few visits, or many visits on one day, are not', () => {
    expect(homeBasePages(openOn([2, 3, 4]), day(5)).size).toBe(0);
    const once = [1, 2, 3, 4, 5].reduce((acc) => recordPageDay(acc, dash, day(5)), {} as PageDays);
    expect(homeBasePages(once, day(5)).size).toBe(0);
  });
  it('counts only the last 7 days', () => {
    expect(homeBasePages(openOn([1, 2, 3, 4]), day(11)).size).toBe(0);
    expect(HOME_BASE_DAYS).toBeLessThanOrEqual(7);
  });
  it('counts pages, not sites, and ignores searches and browser pages', () => {
    let days: PageDays = {};
    for (const [d, v] of [[2, 'a'], [3, 'b'], [4, 'c'], [5, 'd']] as const) days = recordPageDay(days, `https://www.youtube.com/watch?v=${v}`, day(d));
    for (const d of [2, 3, 4, 5]) days = recordPageDay(days, 'https://www.google.com/search?q=x', day(d));
    for (const d of [2, 3, 4, 5]) days = recordPageDay(days, 'chrome://newtab/', day(d));
    expect(homeBasePages(days, day(5)).size).toBe(0);
  });
  it('forgets pages not opened for two weeks', () => {
    const days = openOn([20], 'https://later.example.com/', openOn([1]));
    expect(Object.keys(days)).toEqual(['https://later.example.com']);
  });
});
