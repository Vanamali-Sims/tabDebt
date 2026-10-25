import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { ConfigError, createModel, endpointOf, originPattern } from './models';

const s = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });

describe('createModel', () => {
  it('builds a model for each provider that has a key', () => {
    for (const provider of ['openrouter', 'anthropic', 'openai', 'google'] as const) {
      const m = createModel(s({ mode: 'key', provider, apiKey: 'sk-test', model: 'some-model' }));
      expect(m).toBeTruthy();
    }
  });

  it('needs a key for hosted providers but not for a local server', () => {
    expect(() => createModel(s({ mode: 'key', provider: 'openai', apiKey: '  ' }))).toThrow(ConfigError);
    expect(createModel(s({ mode: 'local', apiKey: '', model: 'llama3.2', baseUrl: 'http://localhost:11434/v1' }))).toBeTruthy();
  });

  it('refuses built-in mode and an empty model name', () => {
    expect(() => createModel(s({ mode: 'builtin' }))).toThrow(ConfigError);
    expect(() => createModel(s({ mode: 'key', apiKey: 'k', model: ' ' }))).toThrow(/model/i);
  });
});

describe('endpointOf and originPattern', () => {
  it('says where requests will go', () => {
    expect(endpointOf(s({ mode: 'builtin' }))).toBeNull();
    expect(endpointOf(s({ mode: 'key', provider: 'anthropic' }))).toBe('https://api.anthropic.com');
    expect(endpointOf(s({ mode: 'local', baseUrl: 'http://localhost:11434/v1' }))).toBe('http://localhost:11434/v1');
  });

  it('turns an address into a permission pattern', () => {
    expect(originPattern('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/*');
    expect(originPattern('http://localhost:11434/v1')).toBe('http://localhost:11434/*');
    expect(originPattern('nonsense')).toBeNull();
  });
});
