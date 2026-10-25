import { describe, expect, it } from 'vitest';
import { badgeText, msUntilNext } from './badge';

describe('badgeText', () => {
  it('shows the count, nothing for zero, and caps large numbers', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(34)).toBe('34');
    expect(badgeText(250)).toBe('99+');
  });
});

describe('msUntilNext', () => {
  it('finds the next occurrence today or tomorrow', () => {
    const morning = new Date(2026, 9, 26, 9, 0, 0);
    expect(msUntilNext(17, 30, morning)).toBe(8.5 * 3_600_000);
    const evening = new Date(2026, 9, 26, 18, 0, 0);
    expect(msUntilNext(17, 30, evening)).toBe(23.5 * 3_600_000);
  });
});
