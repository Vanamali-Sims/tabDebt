import { describe, expect, it } from 'vitest';
import { DEFAULT_EXCLUSIONS, classifyByRules } from '../src/lib/rules';
import { CASES, NOW, allowed, toRecord } from './cases';
import { report, score } from './metrics';

describe('rules baseline on the labelled cases', () => {
  const records = CASES.map(toRecord);
  const { decided } = classifyByRules(records, { now: NOW, exclusions: DEFAULT_EXCLUSIONS, memory: [], hasChildren: new Set() });
  const byId = new Map(CASES.map((c) => [c.id, c]));

  it('every case file entry is well formed and ids are unique', () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    for (const c of CASES) expect(['done', 'read', 'project', 'task', 'keep']).toContain(c.expected);
  });

  it('only decides cases whose label it agrees with', () => {
    const wrong = decided.filter((v) => !allowed(byId.get(v.recordId)!).includes(v.action));
    expect(wrong.map((v) => `${v.recordId}: ${v.action}`)).toEqual([]);
  });

  it('never closes a tab that should stay', () => {
    const m = score(decided.map((v) => ({ case: byId.get(v.recordId)!, predicted: v.action })));
    expect(m.unsafeCloses).toEqual([]);
  });

  it('settles a useful share of cases for free', () => {
    // Printed for reference: how much work the agent is spared.
    console.log(`rules decide ${decided.length}/${CASES.length} cases\n` + report(score(decided.map((v) => ({ case: byId.get(v.recordId)!, predicted: v.action })))));
    expect(decided.length).toBeGreaterThanOrEqual(6);
  });
});
