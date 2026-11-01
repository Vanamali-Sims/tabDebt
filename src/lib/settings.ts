import { DEFAULT_EXCLUSIONS } from './rules';

export type Provider = 'openrouter' | 'anthropic' | 'openai' | 'google' | 'custom';

export interface Settings {
  /**
   * device: the model built into Chrome, free and on this computer. key: your own provider key.
   * local: Ollama or LM Studio. builtin: rules only, no AI.
   */
  mode: 'device' | 'builtin' | 'key' | 'local';
  provider: Provider;
  model: string;
  apiKey: string;
  /** Base URL for custom and local endpoints. */
  baseUrl: string;
  /** Let the agent read the first part of a page. Needs the optional site permission. */
  readPageText: boolean;
  /** Check how far into a video you got. Asks for YouTube and Vimeo (every site if Unsent text is on). */
  checkVideo: boolean;
  /** Keep tabs with something typed in a text box. Asks for every site. Never reads what was typed. */
  checkTyping: boolean;
  exclusions: string[];
  /** Most tabs one review sends to the agent. */
  maxTabsPerRun: number;
  /** Most model steps for one review. */
  maxSteps: number;
  /** Open the panel on "Here's where you left off" the first time each day. */
  morningView: boolean;
  /** Ask "Finishing up?" once in the evening. Off until the person says yes after their first review. */
  wrapUpPrompt: boolean;
  /** Whether that question has been asked, so it's asked once. */
  nudgeAsked: boolean;
  /** Usual finish time in minutes after midnight, once confirmed. Null means use the learned one. */
  finishMinutes: number | null;
  frequency: 'daily' | 'weekly' | 'badge';
  /** The badge turns amber from this many open tabs, and prompts need at least this many. */
  tabLimit: number;
  /** Reminders are paused until this time (ms). */
  pausedUntil: number;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'device',
  provider: 'openrouter',
  model: 'anthropic/claude-haiku-5.5',
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1',
  readPageText: false,
  checkVideo: false,
  checkTyping: false,
  exclusions: DEFAULT_EXCLUSIONS,
  maxTabsPerRun: 40,
  maxSteps: 12,
  morningView: true,
  wrapUpPrompt: false,
  nudgeAsked: false,
  finishMinutes: null,
  frequency: 'daily',
  tabLimit: 10,
  pausedUntil: 0,
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
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
