import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryRepos } from './memory-store';
import { buildPlan, friendlyError } from './review';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import type { Repos, TabRecord } from './types';

const NOW = 80 * 24 * 3_600_000;
const HOUR = 3_600_000;
const rec = (id: string, tabId: number, over: Partial<TabRecord> = {}): TabRecord => ({
  id, tabId, url: `https://${id}.example.com/p`, title: id, pinned: false, audible: false,
  openedAt: 0, lastActiveAt: NOW - 3 * HOUR, activeMs: 60_000, visits: 2, ...over,
});

const submit = (decisions: unknown[]) =>
  new MockLanguageModelV4({
    doGenerate: [{
      content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'submit_plan', input: JSON.stringify({ decisions }) }],
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      usage: { inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } },
      warnings: [],
    }],
  });

let repos: Repos;
const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });

beforeEach(async () => {
  repos = memoryRepos();
  await repos.tabs.put(rec('pinned', 1, { pinned: true, title: 'Pinned music player' }));
  await repos.tabs.put(rec('dup1', 2, { url: 'https://docs.example.com/a', title: 'Docs copy old', lastActiveAt: NOW - 30 * HOUR }));
  await repos.tabs.put(rec('dup2', 3, { url: 'https://docs.example.com/a', title: 'Docs copy new' }));
  await repos.tabs.put(rec('blog', 4, { title: 'Deep work essay', lastActiveAt: NOW - 70 * HOUR }));
  await repos.tabs.put(rec('fresh', 5, { title: 'Spec draft' }));
});

describe('buildPlan', () => {
  it('uses rules only in built-in mode, and never closes an unclear tab', async () => {
    const plan = await buildPlan({ repos, settings: settings({ mode: 'builtin' }), now: NOW });
    const by = Object.fromEntries(plan.entries.map((e) => [e.recordId, e]));
    expect(by.pinned).toMatchObject({ action: 'keep', source: 'rules' });
    expect(by.dup1).toMatchObject({ action: 'done', source: 'rules', approved: true });
    expect(by.blog).toMatchObject({ action: 'read', source: 'fallback' });
    expect(by.fresh).toMatchObject({ action: 'keep', source: 'fallback' });
    expect(by.dup2).toMatchObject({ action: 'keep', source: 'fallback' });
    expect(plan.counts).toMatchObject({ rules: 2, fallback: 3, agent: 0 });
    expect(plan.usage).toBeUndefined();
  });

  it('sends only what the rules could not decide to the agent', async () => {
    // Stalest first: t1 = blog, t2 = the surviving docs copy, t3 = fresh.
    const model = submit([
      { ref: 't1', action: 'read', reason: 'Long essay', confidence: 0.8, summary: 'An essay on focus' },
      { ref: 't2', action: 'keep', reason: 'In use', confidence: 0.9 },
      { ref: 't3', action: 'project', project: 'Specs', reason: 'Work doc', confidence: 0.9 },
    ]);
    const plan = await buildPlan({ repos, settings: settings({ mode: 'key' }), now: NOW, model });
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('Deep work essay');
    expect(prompt).toContain('Spec draft');
    expect(prompt).toContain('Docs copy new');
    expect(prompt).not.toContain('Docs copy old');
    expect(prompt).not.toContain('Pinned music player');
    expect(plan.counts.agent).toBe(3);
    expect(plan.usage?.inputTokens).toBe(50);
    expect(plan.entries.find((e) => e.recordId === 'fresh')).toMatchObject({ action: 'project', project: 'Specs' });
  });

  it('starts low-confidence suggestions unticked', async () => {
    const model = submit([
      { ref: 't1', action: 'read', reason: 'Maybe', confidence: 0.4 },
      { ref: 't2', action: 'keep', reason: 'In use', confidence: 0.9 },
      { ref: 't3', action: 'read', reason: 'Sure', confidence: 0.9 },
    ]);
    const plan = await buildPlan({ repos, settings: settings({ mode: 'key' }), now: NOW, model });
    expect(plan.entries.find((e) => e.recordId === 'blog')?.approved).toBe(false);
    expect(plan.entries.find((e) => e.recordId === 'fresh')?.approved).toBe(true);
  });

  it('falls back to rules with a plain warning when the AI call fails', async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw new Error('401 Unauthorized: invalid api key'); } });
    const plan = await buildPlan({ repos, settings: settings({ mode: 'key' }), now: NOW, model });
    expect(plan.warning).toMatch(/didn't accept the key/);
    expect(plan.entries.find((e) => e.recordId === 'dup1')?.action).toBe('done');
    expect(plan.entries.find((e) => e.recordId === 'blog')?.source).toBe('fallback');
  });

  it('respects the per-run tab limit and sends the stalest first', async () => {
    const model = submit([{ ref: 't1', action: 'read', reason: 'x', confidence: 0.9 }]);
    const plan = await buildPlan({ repos, settings: settings({ mode: 'key', maxTabsPerRun: 1 }), now: NOW, model });
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('Deep work essay');
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).not.toContain('Spec draft');
    expect(plan.entries.find((e) => e.recordId === 'fresh')?.source).toBe('fallback');
  });

  it('keeps tabs from sites the user kept before', async () => {
    await repos.memory.put({ host: 'blog.example.com', action: 'keep', count: 1, updatedAt: 0 });
    const plan = await buildPlan({ repos, settings: settings({ mode: 'builtin' }), now: NOW });
    expect(plan.entries.find((e) => e.recordId === 'blog')).toMatchObject({ action: 'keep', source: 'memory' });
  });
});

describe('friendlyError', () => {
  it('explains common failures in plain words', () => {
    expect(friendlyError(new Error('429 rate limit'))).toMatch(/limit or balance/);
    expect(friendlyError(new Error('Failed to fetch'))).toMatch(/reach/);
    expect(friendlyError(new Error('boom'))).toMatch(/boom/);
  });
});
