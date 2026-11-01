import { describe, expect, it } from 'vitest';
import { memoryRepos } from '../memory-store';
import { buildPlan } from '../review';
import { DEFAULT_SETTINGS } from '../settings';
import type { TabRecord } from '../types';
import { DEVICE_BATCH, deviceStatus, runDeviceAgent, unfence, type DeviceModelApi, type DeviceSession } from './device';

const NOW = 80 * 24 * 3_600_000;
const rec = (i: number): TabRecord => ({
  id: `r${i}`, tabId: i, url: `https://site${i}.example.com/p`, title: `Tab ${i}`, pinned: false, audible: false,
  openedAt: 0, lastActiveAt: NOW - 3 * 3_600_000, activeMs: 60_000, visits: 2,
});

/** A stand-in for Chrome's model that answers each batch from a function. */
function fakeModel(answer: (prompt: string, call: number) => string, status: 'available' | 'downloadable' = 'available') {
  const prompts: string[] = [];
  let created = 0;
  let destroyed = 0;
  const session = (): DeviceSession => ({
    prompt: async (p) => { prompts.push(p); return answer(p, prompts.length); },
    clone: async () => { created++; return session(); },
    destroy: () => { destroyed++; },
  });
  const lm: DeviceModelApi = { availability: async () => status, create: async () => { created++; return session(); } };
  return { lm, prompts, counts: () => ({ created, destroyed }) };
}

const refsIn = (prompt: string) => [...prompt.matchAll(/^(t\d+) \|/gm)].map((m) => m[1]!);

describe('runDeviceAgent', () => {
  it('sorts tabs in small batches and frees every session', async () => {
    const tabs = Array.from({ length: DEVICE_BATCH + 3 }, (_, i) => rec(i + 1));
    const fake = fakeModel((p) => JSON.stringify({ decisions: refsIn(p).map((ref) => ({ ref, action: 'done', reason: 'Finished', confidence: 0.9 })) }));
    const out = await runDeviceAgent({ tabs, allRecords: tabs, now: NOW, lm: fake.lm });
    expect(fake.prompts).toHaveLength(2);
    expect(out.verdicts).toHaveLength(tabs.length);
    expect(out.verdicts.every((v) => v.action === 'done' && v.source === 'agent')).toBe(true);
    const c = fake.counts();
    expect(c.destroyed).toBe(c.created);
  });

  it('applies the same safety rules as the cloud agent', async () => {
    const tabs = [rec(1), rec(2), rec(3)];
    const fake = fakeModel(() => '```json\n' + JSON.stringify({ decisions: [
      { ref: 't1', action: 'done', reason: 'Maybe done', confidence: 0.4 },
      { ref: 't2', action: 'task', reason: 'Pay it', confidence: 1.3, task: { title: 'Pay the invoice' } },
      { ref: 't9', action: 'done', reason: 'Not a real tab', confidence: 1 },
    ] }) + '\n```');
    const out = await runDeviceAgent({ tabs, allRecords: tabs, now: NOW, lm: fake.lm });
    const by = Object.fromEntries(out.verdicts.map((v) => [v.recordId, v]));
    expect(by.r1).toMatchObject({ action: 'read' }); // unsure never means closed
    expect(by.r2).toMatchObject({ action: 'task', confidence: 1, task: { title: 'Pay the invoice' } });
    expect(by.r3).toMatchObject({ source: 'fallback' }); // undecided tabs are left alone
    expect(out.verdicts).toHaveLength(3);
  });

  it('keeps going when one batch returns nonsense', async () => {
    const tabs = Array.from({ length: DEVICE_BATCH + 1 }, (_, i) => rec(i + 1));
    const fake = fakeModel((p, call) => (call === 1 ? 'not json' : JSON.stringify({ decisions: refsIn(p).map((ref) => ({ ref, action: 'read', reason: 'Later', confidence: 0.8 })) })));
    const out = await runDeviceAgent({ tabs, allRecords: tabs, now: NOW, lm: fake.lm });
    expect(out.verdicts.filter((v) => v.source === 'agent')).toHaveLength(1);
  });
});

describe('device helpers', () => {
  it('reports unsupported when the browser has no model', async () => {
    expect(await deviceStatus(undefined)).toBe('unsupported');
    expect(await deviceStatus(fakeModel(() => '', 'downloadable').lm)).toBe('downloadable');
  });
  it('strips code fences', () => {
    expect(unfence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(unfence('{"a":1}')).toBe('{"a":1}');
  });
});

describe('buildPlan with the built-in model', () => {
  it('uses it for the tabs the rules leave', async () => {
    const repos = memoryRepos();
    for (const i of [1, 2]) await repos.tabs.put(rec(i));
    const fake = fakeModel((p) => JSON.stringify({ decisions: refsIn(p).map((ref) => ({ ref, action: 'read', reason: 'Later', confidence: 0.8 })) }));
    const plan = await buildPlan({ repos, settings: DEFAULT_SETTINGS, now: NOW, device: (input) => runDeviceAgent({ ...input, lm: fake.lm }) });
    expect(plan.counts.agent).toBe(2);
    expect(plan.warning).toBeUndefined();
  });
  it('says why when it is not ready', async () => {
    const repos = memoryRepos();
    await repos.tabs.put(rec(1));
    const plan = await buildPlan({ repos, settings: DEFAULT_SETTINGS, now: NOW, unavailableNote: 'Needs a download' });
    expect(plan.warning).toBe('Needs a download');
    expect(plan.counts.agent).toBe(0);
  });
});
