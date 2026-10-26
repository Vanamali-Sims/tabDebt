import { describe, expect, it } from 'vitest';
import { isSnoozeAlarm, pickDue, snoozeIdOf } from './snooze';

describe('snooze helpers', () => {
  it('finds entries that are due', () => {
    const e = [{ id: 'a', url: 'u', title: 't', wakeAt: 10 }, { id: 'b', url: 'u', title: 't', wakeAt: 99 }];
    expect(pickDue(e, 50).map((x) => x.id)).toEqual(['a']);
  });
  it('round-trips alarm names', () => {
    expect(isSnoozeAlarm('snooze:abc')).toBe(true);
    expect(isSnoozeAlarm('end-of-day')).toBe(false);
    expect(snoozeIdOf('snooze:abc')).toBe('abc');
  });
});
