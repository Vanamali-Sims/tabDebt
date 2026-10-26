import { describe, expect, it } from 'vitest';
import { changeSinceYesterday, dayKey } from './snapshots';

describe('changeSinceYesterday', () => {
  const now = new Date(2026, 9, 26, 14, 0);
  it('compares against yesterday', () => {
    expect(changeSinceYesterday({ '2026-10-25': 14 }, 10, now)).toBe(-4);
    expect(changeSinceYesterday({ '2026-10-25': 8 }, 10, now)).toBe(2);
  });
  it('is null with no snapshot for yesterday', () => {
    expect(changeSinceYesterday({ '2026-10-20': 14 }, 10, now)).toBeNull();
    expect(changeSinceYesterday({}, 10, now)).toBeNull();
  });
  it('formats local days with padding', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
