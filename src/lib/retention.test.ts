import { describe, expect, it } from 'vitest';
import { memoryRepos } from './memory-store';
import { prune } from './retention';
import type { TabRecord } from './types';

const DAY = 24 * 3_600_000;
const NOW = 100 * DAY;
const rec = (id: string, over: Partial<TabRecord>): TabRecord => ({
  id, tabId: null, url: `https://${id}.test`, title: id, pinned: false, audible: false,
  openedAt: 0, lastActiveAt: 0, activeMs: 0, visits: 0, ...over,
});

describe('prune', () => {
  it('removes closed tabs and runs older than 30 days and keeps everything else', async () => {
    const repos = memoryRepos();
    await repos.tabs.put(rec('open', { tabId: 1 }));
    await repos.tabs.put(rec('old', { closedAt: NOW - 31 * DAY }));
    await repos.tabs.put(rec('recent', { closedAt: NOW - 5 * DAY }));
    await repos.runs.put({ id: 'oldrun', at: NOW - 40 * DAY, applied: [] });
    await repos.runs.put({ id: 'newrun', at: NOW - DAY, applied: [] });
    await repos.items.put({ id: 'i', kind: 'read', title: 't', url: 'u', done: false, createdAt: 0, runId: 'oldrun' });

    expect(await prune(repos, NOW)).toEqual({ tabs: 1, runs: 1 });
    expect((await repos.tabs.listClosed()).map((t) => t.id)).toEqual(['recent']);
    expect(await repos.tabs.listOpen()).toHaveLength(1);
    expect((await repos.runs.list()).map((r) => r.id)).toEqual(['newrun']);
    expect(await repos.items.list()).toHaveLength(1);
  });
});
