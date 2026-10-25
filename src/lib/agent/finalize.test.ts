import { describe, expect, it } from 'vitest';
import { finalizeVerdicts, type RawDecision } from './finalize';
import type { TabRecord } from '../types';

const NOW = 50 * 24 * 3_600_000;
const rec = (id: string, over: Partial<TabRecord> = {}): TabRecord => ({
  id, tabId: 1, url: `https://${id}.test/`, title: id, pinned: false, audible: false,
  openedAt: 0, lastActiveAt: NOW - 3_600_000, activeMs: 0, visits: 1, ...over,
});
const tabs = (...r: TabRecord[]) => new Map(r.map((x, i) => [`t${i + 1}`, x]));
const raw = (...d: RawDecision[]) => new Map(d.map((x) => [x.ref, x]));
const d = (ref: string, over: Partial<RawDecision> = {}): RawDecision => ({ ref, action: 'done', reason: 'finished', confidence: 0.9, ...over });
const run = (t: Map<string, TabRecord>, r: Map<string, RawDecision>, flagged = new Set<string>()) =>
  finalizeVerdicts(t, r, new Map(), flagged, NOW);

describe('finalizeVerdicts', () => {
  it('turns an unsure close into a save-for-later', () => {
    const [v] = run(tabs(rec('a')), raw(d('t1', { confidence: 0.5 })));
    expect(v).toMatchObject({ action: 'read', source: 'agent' });
    expect(v?.reason).toContain('not sure enough to close');
  });

  it('keeps a confident close', () => {
    expect(run(tabs(rec('a')), raw(d('t1')))[0]?.action).toBe('done');
  });

  it('needs a task title for a task and a name for a project', () => {
    const [a, b, c] = run(
      tabs(rec('a'), rec('b'), rec('c')),
      raw(d('t1', { action: 'task' }), d('t2', { action: 'project' }), d('t3', { action: 'task', task: { title: 'Pay invoice', due: 'Fri' } })),
    );
    expect(a?.action).toBe('read');
    expect(b?.action).toBe('read');
    expect(c).toMatchObject({ action: 'task', task: { title: 'Pay invoice', due: 'Fri' } });
  });

  it('leaves flagged pages alone whatever the agent said', () => {
    const [v] = run(tabs(rec('a')), raw(d('t1')), new Set(['t1']));
    expect(v).toMatchObject({ action: 'keep', flagged: true });
  });

  it('never closes what the agent skipped: stale tabs go to read, fresh ones stay', () => {
    const [stale, fresh] = run(tabs(rec('a', { lastActiveAt: NOW - 5 * 24 * 3_600_000 }), rec('b')), raw());
    expect(stale).toMatchObject({ action: 'read', source: 'fallback' });
    expect(fresh).toMatchObject({ action: 'keep', source: 'fallback' });
  });

  it('cleans and limits text and confidence', () => {
    const [v] = run(tabs(rec('a')), raw(d('t1', { reason: '  lots   of\nspace ' + 'x'.repeat(500), confidence: 7 })));
    expect(v?.reason.length).toBeLessThanOrEqual(140);
    expect(v?.reason.startsWith('lots of space')).toBe(true);
    expect(v?.confidence).toBe(1);
  });

  it('drops decisions for refs it was never given', () => {
    expect(run(tabs(rec('a')), raw(d('t1'), d('t99')))).toHaveLength(1);
  });
});
