import { describe, expect, it } from 'vitest';
import { searchClosed } from './search';
import type { SavedItem, TabRecord } from './types';

const closed = (title: string, url: string, closedAt = 1): TabRecord => ({
  id: title, tabId: null, url, title, pinned: false, audible: false,
  openedAt: 0, lastActiveAt: 0, activeMs: 0, visits: 0, closedAt,
});
const item = (title: string, summary: string): SavedItem => ({
  id: title, kind: 'read', title, url: 'https://x.test/' + title, summary, done: false, createdAt: 2, runId: 'r',
});

describe('searchClosed', () => {
  const tabs = [
    closed('React Query: caching guide', 'https://tanstack.com/query/caching'),
    closed('Cat photos', 'https://cats.example/'),
  ];
  const saved = [item('Why we hoard tabs', 'Open tabs act as reminders, a caching of intent')];

  it('requires every word and finds matches in titles, urls and summaries', () => {
    expect(searchClosed('react caching', tabs, saved).map((h) => h.title)).toEqual(['React Query: caching guide']);
    expect(searchClosed('tanstack', tabs, saved)).toHaveLength(1);
    expect(searchClosed('reminders', tabs, saved)[0]?.kind).toBe('saved');
  });

  it('ranks title matches above matches elsewhere', () => {
    const hits = searchClosed('caching', tabs, saved);
    expect(hits[0]?.title).toBe('React Query: caching guide');
    expect(hits).toHaveLength(2);
  });

  it('returns nothing for an empty or unmatched query', () => {
    expect(searchClosed('  ', tabs, saved)).toEqual([]);
    expect(searchClosed('zebra', tabs, saved)).toEqual([]);
  });
});
