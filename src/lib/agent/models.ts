import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { Settings } from '../settings';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Where requests for these settings go. Shown to the user and used to ask for permission. */
export function endpointOf(s: Settings): string | null {
  if (s.mode === 'builtin') return null;
  if (s.mode === 'local') return s.baseUrl;
  switch (s.provider) {
    case 'openrouter': return OPENROUTER_URL;
    case 'anthropic': return 'https://api.anthropic.com';
    case 'openai': return 'https://api.openai.com';
    case 'google': return 'https://generativelanguage.googleapis.com';
    case 'custom': return s.baseUrl;
  }
}

/** The origin pattern to request browser permission for, so requests can go straight to the provider. */
export function originPattern(url: string): string | null {
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return null;
  }
}

/**
 * Builds the model from the user's own settings. The key never leaves the browser except in
 * requests to the provider the user chose.
 */
export function createModel(s: Settings): LanguageModel {
  if (s.mode === 'builtin') throw new ConfigError('Built-in mode does not use an AI model.');
  if (!s.model.trim()) throw new ConfigError('Choose a model first.');

  if (s.mode === 'local') {
    if (!s.baseUrl.trim()) throw new ConfigError('Enter the address of your local server.');
    return createOpenAICompatible({ name: 'local', baseURL: s.baseUrl, apiKey: s.apiKey || 'local' })(s.model);
  }

  if (!s.apiKey.trim() && s.provider !== 'custom') throw new ConfigError('Paste your API key first.');
  switch (s.provider) {
    case 'openrouter':
      return createOpenAICompatible({ name: 'openrouter', baseURL: OPENROUTER_URL, apiKey: s.apiKey })(s.model);
    case 'anthropic':
      return createAnthropic({
        apiKey: s.apiKey,
        // Required by Anthropic for calls made straight from a browser.
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(s.model);
    case 'openai':
      return createOpenAI({ apiKey: s.apiKey })(s.model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: s.apiKey })(s.model);
    case 'custom':
      if (!s.baseUrl.trim()) throw new ConfigError('Enter the address of your endpoint.');
      return createOpenAICompatible({ name: 'custom', baseURL: s.baseUrl, apiKey: s.apiKey || 'none' })(s.model);
  }
}
