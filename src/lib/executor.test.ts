import { beforeEach, describe, expect, it } from 'vitest';
import { applyPlan, undoRun, type TabsApi } from './executor';
import { memoryRepos } from './memory-store';
import type { PlanEntry, Repos, TabRecord } from './types';

let repos: Repos;
let removed: number[];
let created: string[];
const api: TabsApi = {
  remove: async (id) => void removed.push(id),
  create: async (url) => void created.push(url),
};

const rec = (id: string, tabId: number, over: Partial<TabRecord> = {}): TabRecord => ({
  id, tabId, url: `https://${id}.example.com/page`, title: `Title ${id}`,
  pinned: false, audible: false, openedAt: 0, lastActiveAt: 0, activeMs: 0, visits: 1, ...over,
});
const entry = (recordId: string, action: PlanEntry['action'], over: Partial<PlanEntry> = {}): PlanEntry => ({
  recordId, action, reason: 'because', confidence: 0.9, source: 'agent', approved: true, ...over,
});

beforeEach(async () => {
  repos = memoryRepos();
  removed = [];
  created = [];
  for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) await repos.tabs.put(rec(id, i + 1));
});

describe('applyPlan', () => {
  it('closes done tabs and saves read, project and task tabs as items', async () => {
    const { run } = await applyPlan(
      [
        entry('a', 'done'),
        entry('b', 'read', { summary: 'A short read' }),
        entry('c', 'task', { task: { title: 'Pay invoice', due: 'Friday' } }),
        entry('d', 'project', { project: 'Onboarding' }),
      ],
      repos, api, () => 5_000,
    );
    expect(removed.sort()).toEqual([1, 2, 3, 4]);
    expect(run.applied).toHaveLength(4);
    const items = await repos.items.list();
    expect(items.map((i) => i.kind).sort()).toEqual(['project', 'read', 'task']);
    expect(items.find((i) => i.kind === 'task')).toMatchObject({ title: 'Pay invoice', due: 'Friday', done: false });
    expect((await repos.tabs.get('a'))).toMatchObject({ closedBy: 'agent', closedAt: 5_000, tabId: null });
  });

  it('marks the tab closed before removing it, so the close is not credited to the user', async () => {
    let seenClosedAtRemoval = false;
    await applyPlan([entry('a', 'done')], repos, {
      ...api,
      remove: async () => { seenClosedAtRemoval = (await repos.tabs.get('a'))?.closedBy === 'agent'; },
    });
    expect(seenClosedAtRemoval).toBe(true);
  });

  it('never closes a pinned or audible tab, even if the plan says to', async () => {
    await repos.tabs.put(rec('a', 1, { pinned: true }));
    await repos.tabs.put(rec('b', 2, { audible: true }));
    const { run, skipped } = await applyPlan([entry('a', 'done'), entry('b', 'done')], repos, api);
    expect(removed).toEqual([]);
    expect(run.applied).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['Pinned', 'Playing audio']);
  });

  it('ignores keep entries, unknown ids and tabs that are already closed', async () => {
    await repos.tabs.put(rec('c', 3, { tabId: null, closedAt: 1 }));
    const { run, skipped } = await applyPlan([entry('a', 'keep'), entry('zzz', 'done'), entry('c', 'done')], repos, api);
    expect(removed).toEqual([]);
    expect(run.applied).toEqual([]);
    expect(skipped).toEqual([{ recordId: 'c', reason: 'Already closed' }]);
  });

  it('leaves unticked tabs open and remembers the site', async () => {
    await applyPlan([entry('a', 'done', { approved: false })], repos, api);
    await applyPlan([entry('a', 'done', { approved: false })], repos, api);
    expect(removed).toEqual([]);
    expect(await repos.memory.get('a.example.com')).toMatchObject({ action: 'keep', count: 2 });
  });

  it('does not store a run when nothing was applied', async () => {
    await applyPlan([entry('a', 'keep')], repos, api);
    expect(await repos.runs.latest()).toBeUndefined();
  });
});

describe('undoRun', () => {
  it('reopens tabs, removes saved items, and only works once', async () => {
    const { run } = await applyPlan([entry('a', 'done'), entry('b', 'read')], repos, api);
    expect(await repos.items.list()).toHaveLength(1);

    expect(await undoRun(run.id, repos, api, () => 9_000)).toBe(2);
    expect(created.sort()).toEqual(['https://a.example.com/page', 'https://b.example.com/page']);
    expect(await repos.items.list()).toHaveLength(0);
    expect((await repos.runs.get(run.id))?.undoneAt).toBe(9_000);

    expect(await undoRun(run.id, repos, api)).toBe(0);
    expect(created).toHaveLength(2);
  });
});
