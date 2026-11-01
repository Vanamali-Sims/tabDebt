import { describe, expect, it } from 'vitest';
import { clearedGroups, clearedNote, clearedThisWeek, whenLabel } from './cleared';
import type { AppliedDecision, Run } from './types';

const now = new Date(2026, 10, 2, 10, 30).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const oct = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
const applied = (id: string, action: AppliedDecision['action'], source: AppliedDecision['source'] = 'rules'): AppliedDecision =>
  ({ recordId: id, action, url: `https://${id}.example.com/`, title: id, reason: 'Duplicate of another open tab', source, confidence: 0.9 });
const run = (id: string, when: number, list: AppliedDecision[], undoneAt?: number): Run => ({ id, at: when, applied: list, undoneAt });

describe('clearedGroups', () => {
  it('lists reviews newest first, skipping undone and empty ones', () => {
    const groups = clearedGroups([
      run('old', oct(30, 18), [applied('a', 'done')]),
      run('last-night', at(1, 21, 41), [applied('b', 'done'), applied('c', 'read', 'agent')]),
      run('undone', at(1, 22), [applied('d', 'done')], at(1, 22, 5)),
      run('empty', at(2, 9), []),
    ], now);
    expect(groups.map((g) => g.runId)).toEqual(['last-night', 'old']);
    expect(groups[0]).toMatchObject({ label: 'Yesterday · 9:41 pm', kind: 'review', saved: 1 });
  });
  it('tells closes from the panel apart from reviews', () => {
    expect(clearedGroups([run('x', at(2, 9), [applied('a', 'done', 'user')])], now)[0]?.kind).toBe('manual');
  });
  it('counts tabs cleared this week', () => {
    const groups = clearedGroups([run('a', at(1, 21), [applied('a', 'done'), applied('b', 'done')]), run('b', oct(20, 9), [applied('c', 'done')])], now);
    expect(clearedThisWeek(groups, now)).toBe(2);
  });
});

describe('labels', () => {
  it('says today, yesterday, a weekday, then a date', () => {
    expect(whenLabel(at(2, 9, 5), now)).toBe('Today · 9:05 am');
    expect(whenLabel(at(1, 21, 41), now)).toBe('Yesterday · 9:41 pm');
    expect(whenLabel(oct(29, 18), now)).toBe('Thursday · 6:00 pm');
    expect(whenLabel(oct(20, 18), now)).toBe('20 Oct · 6:00 pm');
  });
  it('explains what happened to each tab', () => {
    expect(clearedNote(applied('a', 'done'))).toBe('Duplicate of another open tab');
    expect(clearedNote({ ...applied('a', 'read'), reason: 'Stopped at 12:40 of 34:00' })).toBe('Saved to Read · Stopped at 12:40 of 34:00');
  });
});
