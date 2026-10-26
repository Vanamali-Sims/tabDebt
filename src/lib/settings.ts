import { DEFAULT_EXCLUSIONS } from './rules';

export type Provider = 'openrouter' | 'anthropic' | 'openai' | 'google' | 'custom';

export interface Settings {
  /** builtin: rules only, no AI call. key: your own provider key. local: Ollama or LM Studio. */
  mode: 'builtin' | 'key' | 'local';
  provider: Provider;
  model: string;
  apiKey: string;
  /** Base URL for custom and local endpoints. */
  baseUrl: string;
  /** Let the agent read the first part of a page. Needs the optional site permission. */
  readPageText: boolean;
  exclusions: string[];
  /** Most tabs one review sends to the agent. */
  maxTabsPerRun: number;
  /** Most model steps for one review. */
  maxSteps: number;
  /** night: warm dark. day: soft light. system: follow the computer. */
  theme: 'night' | 'day' | 'system';
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'builtin',
  provider: 'openrouter',
  model: 'anthropic/claude-haiku-5.5',
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1',
  readPageText: false,
  exclusions: DEFAULT_EXCLUSIONS,
  maxTabsPerRun: 40,
  maxSteps: 12,
  theme: 'night',
};

/** A small, inexpensive default model for each provider. Users can type any model name. */
export const DEFAULT_MODELS: Record<Provider, string> = {
  openrouter: 'anthropic/claude-haiku-5.5',
  anthropic: 'claude-haiku-5-5',
  openai: 'gpt-5-mini',
  google: 'gemini-2.5-flash',
  custom: '',
};

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
  // 'paper' was an earlier name for the light theme; fall back to the default for anything unknown.
  if (!['night', 'day', 'system'].includes(merged.theme)) merged.theme = DEFAULT_SETTINGS.theme;
  return merged;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
