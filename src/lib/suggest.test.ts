import { describe, expect, it } from 'vitest';
import { buildVocabulary, completeLastWord } from './suggest';

describe('buildVocabulary', () => {
  it('ranks by how often a word appears, then by length', () => {
    const v = buildVocabulary(['React Query caching', 'React docs', 'cache headers']);
    expect(v[0]).toBe('react');
    expect(v).toContain('caching');
  });
  it('ignores very short words', () => {
    expect(buildVocabulary(['a to be or'])).toEqual([]);
  });
  it('keeps host names whole', () => {
    expect(buildVocabulary(['docs.example.com'])).toContain('docs.example.com');
  });
});

describe('completeLastWord', () => {
  const vocab = ['react', 'reactive', 'caching', 'docs.example.com'];
  it('finishes the word being typed', () => {
    expect(completeLastWord('rea', vocab)).toBe('react');
  });
  it('only changes the last word', () => {
    expect(completeLastWord('that cach', vocab)).toBe('that caching');
  });
  it('is case-insensitive in matching but keeps what was typed before', () => {
    expect(completeLastWord('That Rea', vocab)).toBe('That react');
  });
  it('suggests nothing for one letter, an exact word or no match', () => {
    expect(completeLastWord('r', vocab)).toBeNull();
    expect(completeLastWord('react', ['react'])).toBeNull();
    expect(completeLastWord('zz', vocab)).toBeNull();
    expect(completeLastWord('', vocab)).toBeNull();
  });
  it('suggests nothing after a trailing space', () => {
    expect(completeLastWord('react ', vocab)).toBeNull();
  });
});
