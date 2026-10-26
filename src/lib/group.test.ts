import { describe, expect, it } from 'vitest';
import { groupByHost } from './group';
import type { TabRecord } from './types';

const tab = (id: string, url: string, lastActiveAt: number, activeMs = 0): TabRecord => ({
  id, tabId: 1, url, title: id, pinned: false, audible: false, openedAt: 0, lastActiveAt, activeMs, visits: 1,
});

describe('groupByHost', () => {
  it('puts tabs from one site together, ignoring www', () => {
    const g = groupByHost([tab('a', 'https://github.com/x', 1), tab('b', 'https://www.github.com/y', 2), tab('c', 'https://openrouter.ai/k', 3)]);
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.host === 'github.com')?.tabs.map((t) => t.id)).toEqual(['b', 'a']);
  });
  it('orders groups by most recent activity and sums time', () => {
    const g = groupByHost([tab('a', 'https://a.com', 5, 1000), tab('b', 'https://b.com', 9), tab('c', 'https://a.com', 1, 500)]);
    expect(g.map((x) => x.host)).toEqual(['b.com', 'a.com']);
    expect(g[1]!.activeMs).toBe(1500);
  });
});
