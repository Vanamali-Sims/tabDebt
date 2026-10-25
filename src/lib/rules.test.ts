import { describe, expect, it } from 'vitest';
import { DEFAULT_EXCLUSIONS, classifyByRules, isSearchResults, normalizeUrl, type RuleContext } from './rules';
import type { TabRecord } from './types';

const NOW = 100 * 24 * 3_600_000;
const HOUR = 3_600_000;
let n = 0;
const tab = (over: Partial<TabRecord> = {}): TabRecord => ({
  id: `r${++n}`,
  tabId: n,
  url: `https://example.com/page-${n}`,
  title: `Page ${n}`,
  pinned: false,
  audible: false,
  openedAt: NOW - 5 * HOUR,
  lastActiveAt: NOW - 2 * HOUR,
  activeMs: 120_000,
  visits: 2,
  ...over,
});
const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
  now: NOW,
  exclusions: DEFAULT_EXCLUSIONS,
  memory: [],
  hasChildren: new Set(),
  ...over,
});
const action = (tabs: TabRecord[], c: RuleContext, t: TabRecord) =>
  classifyByRules(tabs, c).decided.find((v) => v.recordId === t.id)?.action;

describe('protected tabs', () => {
  it('keeps pinned, audible, active, excluded and draft tabs', () => {
    const pinned = tab({ pinned: true, title: '404 not found' });
    const audio = tab({ audible: true, url: 'https://google.com/search?q=x' });
    const active = tab({ title: 'Page not found' });
    const bank = tab({ url: 'https://www.mybank.com/accounts', title: '404' });
    const draft = tab({ url: 'https://app.example.com/compose/123' });
    const all = [pinned, audio, active, bank, draft];
    const { decided } = classifyByRules(all, ctx({ activeRecordId: active.id }));
    expect(decided.every((v) => v.action === 'keep')).toBe(true);
    expect(decided).toHaveLength(5);
  });

  it('keeps an excluded tab even when it also looks like a duplicate', () => {
    const a = tab({ url: 'https://mail.google.com/mail/u/0/', lastActiveAt: NOW - 9 * HOUR });
    const b = tab({ url: 'https://mail.google.com/mail/u/0/' });
    expect(action([a, b], ctx(), a)).toBe('keep');
  });

  it('honours custom exclusions', () => {
    const t = tab({ url: 'https://crm.mycompany.com/leads', title: '404' });
    expect(action([t], ctx({ exclusions: ['crm.mycompany.com'] }), t)).toBe('keep');
  });
});

describe('memory', () => {
  it('keeps hosts the user has kept before', () => {
    const t = tab({ url: 'https://jira.example.com/browse/ONB-1' });
    const v = classifyByRules([t], ctx({ memory: [{ host: 'jira.example.com', action: 'keep', count: 2 }] })).decided[0];
    expect(v).toMatchObject({ action: 'keep', source: 'memory' });
  });
});

describe('duplicates', () => {
  it('closes older copies and keeps the most recently used', () => {
    const old = tab({ url: 'https://docs.example.com/a?utm_source=x#top', lastActiveAt: NOW - 30 * HOUR });
    const fresh = tab({ url: 'https://docs.example.com/a/', lastActiveAt: NOW - HOUR });
    const { decided, unresolved } = classifyByRules([old, fresh], ctx());
    expect(decided).toHaveLength(1);
    expect(decided[0]).toMatchObject({ recordId: old.id, action: 'done' });
    expect(unresolved).toEqual([fresh]);
  });

  it('treats different query strings as different pages', () => {
    expect(normalizeUrl('https://x.com/watch?v=1')).not.toBe(normalizeUrl('https://x.com/watch?v=2'));
  });
});

describe('finished pages', () => {
  it('closes a search once you opened a result from it', () => {
    const search = tab({ url: 'https://www.google.com/search?q=react+query' });
    expect(action([search], ctx({ hasChildren: new Set([search.id]) }), search)).toBe('done');
  });

  it('closes an old search but leaves a fresh one', () => {
    const oldSearch = tab({ url: 'https://www.google.com/search?q=a', lastActiveAt: NOW - 30 * HOUR });
    const fresh = tab({ url: 'https://www.google.com/search?q=b', lastActiveAt: NOW - HOUR });
    expect(action([oldSearch, fresh], ctx(), oldSearch)).toBe('done');
    expect(action([oldSearch, fresh], ctx(), fresh)).toBeUndefined();
  });

  it('closes confirmation and error pages', () => {
    const order = tab({ title: 'Order confirmed - thanks!', url: 'https://shop.example.com/checkout/complete' });
    const err = tab({ title: '404 Not Found' });
    const ok = tab({ title: 'Quarterly plan' });
    const result = classifyByRules([order, err, ok], ctx());
    expect(result.decided.map((v) => v.action)).toEqual(['done', 'done']);
    expect(result.unresolved).toEqual([ok]);
  });

  it('only closes a login page you barely used and left alone for a day', () => {
    const left = tab({ title: 'Sign in to Acme', activeMs: 5_000, lastActiveAt: NOW - 30 * HOUR });
    const recent = tab({ title: 'Sign in to Acme', activeMs: 5_000, lastActiveAt: NOW - HOUR });
    expect(action([left, recent], ctx(), left)).toBe('done');
    expect(action([left, recent], ctx(), recent)).toBeUndefined();
  });
});

describe('unclear tabs', () => {
  it('are passed on rather than guessed at', () => {
    const article = tab({ title: 'The case for deep work', url: 'https://blog.example.com/deep-work' });
    expect(classifyByRules([article], ctx())).toEqual({ decided: [], unresolved: [article] });
  });
});

describe('isSearchResults', () => {
  it('recognises results pages but not the home page', () => {
    expect(isSearchResults('https://www.google.com/search?q=x')).toBe(true);
    expect(isSearchResults('https://duckduckgo.com/?q=x')).toBe(true);
    expect(isSearchResults('https://www.google.com/')).toBe(false);
    expect(isSearchResults('https://example.com/search')).toBe(false);
  });
});
