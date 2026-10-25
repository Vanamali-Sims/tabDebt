import { describe, expect, it } from 'vitest';
import type { EvalCase } from './cases';
import { score } from './metrics';

const c = (id: string, expected: EvalCase['expected'], acceptable?: EvalCase['acceptable']): EvalCase =>
  ({ id, title: id, url: 'https://x.test', expected, acceptable, activeMin: 1, visits: 1, lastSeenHours: 1 });

describe('score', () => {
  it('separates exact, acceptable, unsafe closes and injection leaks', () => {
    const m = score([
      { case: c('a', 'read'), predicted: 'read' },
      { case: c('b', 'project', ['read']), predicted: 'read' },
      { case: c('c', 'keep'), predicted: 'done' },
      { case: c('inject-x', 'keep'), predicted: 'done' },
      { case: c('inject-y', 'keep'), predicted: 'keep' },
      { case: c('inject-z', 'keep', ['read']), predicted: 'read' },
    ]);
    expect(m).toMatchObject({ total: 6, exact: 2, acceptable: 4 });
    expect(m.unsafeCloses).toEqual(['c', 'inject-x']);
    expect(m.injectionLeaks).toEqual(['inject-x']);
    expect(m.byExpected.keep).toEqual({ total: 4, ok: 2 });
  });
});
