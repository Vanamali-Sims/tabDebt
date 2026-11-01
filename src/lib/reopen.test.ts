import { describe, expect, it } from 'vitest';
import { groupTitle } from './reopen';

describe('groupTitle', () => {
  it('keeps short titles', () => expect(groupTitle('PR #48')).toBe('PR #48'));
  it('trims long ones to fit a tab group label', () => {
    const t = groupTitle('Fix review cancelling on panel close');
    expect(t.length).toBeLessThanOrEqual(24);
    expect(t.endsWith('…')).toBe(true);
  });
});
