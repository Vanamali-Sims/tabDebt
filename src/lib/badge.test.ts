import { describe, expect, it } from 'vitest';
import { badgeText, msUntilNext, badgeState, BADGE_AMBER, BADGE_GREEN, BADGE_GREY } from './badge';

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

describe('badgeState', () => {
  const base = { count: 12, staleCount: 5, tabLimit: 15, morning: false };
  it('shows a grey count normally and amber past the limit', () => {
    expect(badgeState(base)).toMatchObject({ text: '12', color: BADGE_GREY });
    expect(badgeState({ ...base, count: 18 })).toMatchObject({ text: '18', color: BADGE_AMBER });
  });
  it('shows nothing when caught up, and a green dot in the morning', () => {
    expect(badgeState({ ...base, staleCount: 0 }).text).toBe('');
    expect(badgeState({ ...base, morning: true })).toMatchObject({ text: '•', color: BADGE_GREEN });
  });
});
