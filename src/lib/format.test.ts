import { describe, expect, it } from 'vitest';
import { formatDuration, hostOf, timeAgo } from './format';

describe('formatDuration', () => {
  it('reads naturally at each scale', () => {
    expect(formatDuration(0)).toBe('under a minute');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(5 * 60_000)).toBe('5 min');
    expect(formatDuration(60 * 60_000)).toBe('1h');
    expect(formatDuration(135 * 60_000)).toBe('2h 15m');
  });
});

describe('timeAgo', () => {
  const now = 10 * 24 * 3_600_000;
  it('reads naturally at each scale', () => {
    expect(timeAgo(now - 5_000, now)).toBe('just now');
    expect(timeAgo(now - 12 * 60_000, now)).toBe('12 min ago');
    expect(timeAgo(now - 5 * 3_600_000, now)).toBe('5h ago');
    expect(timeAgo(now - 30 * 3_600_000, now)).toBe('yesterday');
    expect(timeAgo(now - 3 * 24 * 3_600_000, now)).toBe('3 days ago');
  });
});

describe('hostOf', () => {
  it('drops www and survives bad urls', () => {
    expect(hostOf('https://www.example.com/path?q=1')).toBe('example.com');
    expect(hostOf('not a url')).toBe('not a url');
  });
});
