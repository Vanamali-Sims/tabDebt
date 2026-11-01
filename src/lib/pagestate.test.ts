import { describe, expect, it } from 'vitest';
import { ALL_SITES, VIDEO_ORIGINS, formatClock, mediaVerdict, neededOrigins, resumeUrl } from './pagestate';

const NOW = 1_000 * 24 * 3_600_000;
const tab = (title = 'How caching works', ageMs = 60_000) => ({ url: 'https://www.youtube.com/watch?v=abc', title, lastActiveAt: NOW - ageMs });
const vid = (current: number, duration: number | null, ended = false) => ({ video: { current, duration, ended } });

describe('mediaVerdict', () => {
  it('saves an unfinished video at the spot you stopped', () => {
    const v = mediaVerdict(tab(), vid(760, 2040), NOW);
    expect(v).toMatchObject({ action: 'read', reason: 'Stopped at 12:40 of 34:00' });
    expect(v?.resumeUrl).toBe('https://www.youtube.com/watch?v=abc&t=757s');
  });
  it('calls a video watched from 90%', () => {
    expect(mediaVerdict(tab(), vid(1840, 2040), NOW)?.action).toBe('done');
    expect(mediaVerdict(tab(), vid(100, 2040, true), NOW)?.action).toBe('done');
    expect(mediaVerdict(tab(), vid(1800, 2040), NOW)?.action).toBe('read');
  });
  it('has no opinion on a video barely started, or no video', () => {
    expect(mediaVerdict(tab(), vid(5, 2040), NOW)).toBeNull();
    expect(mediaVerdict(tab(), {}, NOW)).toBeNull();
    expect(mediaVerdict(tab(), undefined, NOW)).toBeNull();
  });
  it('keeps background videos and live streams you used today', () => {
    expect(mediaVerdict(tab('Study with Me in Skyrim | Ambience'), vid(600, 7200), NOW)).toMatchObject({ action: 'keep' });
    expect(mediaVerdict(tab('Some long lecture'), vid(600, 2 * 3600), NOW)?.action).toBe('keep');
    expect(mediaVerdict(tab(), vid(600, null), NOW)).toMatchObject({ action: 'keep', reason: 'Live stream' });
  });
  it('lets the rest decide about background videos left for days', () => {
    expect(mediaVerdict(tab('lofi hip hop radio', 3 * 24 * 3_600_000), vid(600, null), NOW)).toBeNull();
    expect(mediaVerdict(tab('Study with me', 3 * 24 * 3_600_000), vid(600, 7200), NOW)).toBeNull();
  });
  it('never closes an unfinished video', () => {
    for (let t = 0; t < 2040 * 0.9; t += 97) expect(mediaVerdict(tab(), vid(t, 2040), NOW)?.action).not.toBe('done');
  });
});

describe('resumeUrl and formatClock', () => {
  it('resumes YouTube and Vimeo, and leaves other sites alone', () => {
    expect(resumeUrl('https://youtu.be/abc?t=10s', 120)).toBe('https://youtu.be/abc?t=117s');
    expect(resumeUrl('https://vimeo.com/123', 90)).toBe('https://vimeo.com/123#t=87s');
    expect(resumeUrl('https://example.com/video', 90)).toBe('https://example.com/video');
  });
  it('formats clock times', () => {
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(760)).toBe('12:40');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('neededOrigins', () => {
  const off = { readPageText: false, checkTyping: false, checkVideo: false };
  it('asks for as little as each switch needs', () => {
    expect(neededOrigins(off)).toEqual([]);
    expect(neededOrigins({ ...off, checkVideo: true })).toEqual(VIDEO_ORIGINS);
    expect(neededOrigins({ ...off, checkTyping: true })).toEqual(ALL_SITES);
    expect(neededOrigins({ ...off, readPageText: true, checkVideo: true })).toEqual(ALL_SITES);
  });
});
