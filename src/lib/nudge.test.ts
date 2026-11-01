import { describe, expect, it } from 'vitest';
import {
  afterPrompt, afterReview, afterSkip, backoffDue, canPrompt, emptyLog, formatMinutes, fromTimeInput, inWindow,
  learnFinishTime, siteKind, switchSignal, toTimeInput, wrapUpScore, type PromptCheck,
} from './nudge';

const MIN = 60_000;
// Monday 2 November 2026, 5:30 pm
const mon = new Date(2026, 10, 2, 17, 30);

describe('learnFinishTime', () => {
  it('is null until there is a week of weekdays', () => {
    expect(learnFinishTime({ '2026-10-27': 1050, '2026-10-28': 1060 }, mon)).toBeNull();
  });
  it('takes the median of weekday finishes, rounded to 15 minutes', () => {
    const days = { '2026-10-26': 1050, '2026-10-27': 1060, '2026-10-28': 1040, '2026-10-29': 1100, '2026-10-30': 1045, '2026-10-31': 1380 };
    expect(learnFinishTime(days, mon)).toBe(1050); // 5:30 pm; Saturday's late night is ignored
  });
  it('ignores mornings and today', () => {
    const days = { '2026-10-26': 600, '2026-10-27': 1050, '2026-10-28': 1050, '2026-10-29': 1050, '2026-10-30': 1050, '2026-11-02': 1300 };
    expect(learnFinishTime(days, mon)).toBeNull();
  });
});

describe('inWindow', () => {
  it('opens 45 minutes before and closes 90 after', () => {
    expect(inWindow(new Date(2026, 10, 2, 17, 0), 1065)).toBe(true);
    expect(inWindow(new Date(2026, 10, 2, 16, 59), 1065)).toBe(false);
    expect(inWindow(new Date(2026, 10, 2, 19, 15), 1065)).toBe(true);
    expect(inWindow(new Date(2026, 10, 2, 19, 16), 1065)).toBe(false);
  });
});

describe('signals', () => {
  it('sorts sites by kind', () => {
    expect(siteKind('https://github.com/a/b')).toBe('work');
    expect(siteKind('https://www.youtube.com/watch?v=1')).toBe('personal');
    expect(siteKind('https://www.amazon.com.au/x')).toBe('personal');
    expect(siteKind('https://calendar.google.com/r')).toBe('planner');
    expect(siteKind('https://outlook.office.com/calendar/view/day')).toBe('planner');
    expect(siteKind('https://github.com/stranger-things')).toBe('work');
    expect(siteKind('chrome://newtab')).toBeNull();
  });
  it('counts a switch from work to personal, and any planner', () => {
    expect(switchSignal('https://github.com/x', 'https://youtube.com/')).toBe('personal');
    expect(switchSignal('https://news.example.com/', 'https://youtube.com/')).toBeNull();
    expect(switchSignal(undefined, 'https://calendar.google.com/')).toBe('planner');
  });
  it('scores a burst of closes as wrapping up on its own', () => {
    const now = mon.getTime();
    const burst = [1, 2, 3].map((i) => ({ t: now - i * 20_000, kind: 'close' as const }));
    expect(wrapUpScore(burst, now)).toBe(2);
    expect(wrapUpScore(burst.slice(0, 2), now)).toBe(0);
    expect(wrapUpScore([{ t: now - MIN, kind: 'personal' }, { t: now - 5 * MIN, kind: 'planner' }], now)).toBe(2);
    expect(wrapUpScore([{ t: now - 20 * MIN, kind: 'personal' }], now)).toBe(0);
  });
});

describe('canPrompt', () => {
  const base: PromptCheck = { now: mon, enabled: true, frequency: 'daily', pausedUntil: 0, finish: 1050, log: emptyLog(), openCount: 20, tabLimit: 10 };
  it('allows one prompt in the window on a weekday', () => {
    expect(canPrompt(base)).toBe(true);
  });
  it('respects every off switch', () => {
    expect(canPrompt({ ...base, enabled: false })).not.toBe(true);
    expect(canPrompt({ ...base, frequency: 'badge' })).not.toBe(true);
    expect(canPrompt({ ...base, frequency: 'weekly' })).not.toBe(true); // Monday
    expect(canPrompt({ ...base, pausedUntil: mon.getTime() + MIN })).not.toBe(true);
    expect(canPrompt({ ...base, now: new Date(2026, 10, 1, 17, 30) })).not.toBe(true); // Sunday
    expect(canPrompt({ ...base, finish: null })).not.toBe(true);
    expect(canPrompt({ ...base, openCount: 4 })).not.toBe(true);
  });
  it('asks once a day, plus one retry after Not yet', () => {
    const asked = afterPrompt(emptyLog(), mon);
    expect(canPrompt({ ...base, log: asked })).not.toBe(true);
    expect(canPrompt({ ...base, log: asked, retry: true })).toBe(true);
    expect(canPrompt({ ...base, log: afterPrompt(asked, mon, true), retry: true })).not.toBe(true);
    expect(canPrompt({ ...base, log: afterSkip(asked, mon) })).not.toBe(true);
    expect(canPrompt({ ...base, log: afterReview(asked, mon) })).not.toBe(true);
  });
  it('backs off after three skipped evenings', () => {
    let log = emptyLog();
    for (const d of [27, 28, 29, 30]) log = afterPrompt(log, new Date(2026, 9, d, 17, 30));
    expect(log.skipStreak).toBe(3);
    expect(backoffDue(log)).toBe(true);
    expect(canPrompt({ ...base, log })).not.toBe(true);
    expect(afterReview(log, mon).skipStreak).toBe(0);
  });
});

describe('time formatting', () => {
  it('reads and writes times', () => {
    expect(formatMinutes(1065)).toBe('5:45 pm');
    expect(formatMinutes(30)).toBe('12:30 am');
    expect(toTimeInput(1065)).toBe('17:45');
    expect(fromTimeInput('17:45')).toBe(1065);
    expect(fromTimeInput('nope')).toBeNull();
  });
});
