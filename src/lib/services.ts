import { ConfigError, createModel } from './agent/models';
import { idbRepos } from './db';
import { notifyChanged } from './channel';
import { applyPlan, undoRun, type ApplyResult, type TabsApi } from './executor';
import { readPage } from './page';
import { buildPlan, type PlanResult } from './review';
import { loadSettings } from './settings';
import type { PlanEntry } from './types';

/** The panel's one connection to storage and the browser. UI code goes through here. */
export const repos = idbRepos();

export const tabsApi: TabsApi = {
  remove: (id) => chrome.tabs.remove(id),
  create: async (url) => void (await chrome.tabs.create({ url, active: false })),
};

async function activeRecordId(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return undefined;
  return (await repos.tabs.getOpenByTabId(tab.id))?.id;
}

export async function generatePlan(abortSignal?: AbortSignal): Promise<PlanResult> {
  const settings = await loadSettings();
  // A bad key or model name surfaces as a ConfigError the screen shows as a plain message.
  const model = settings.mode === 'builtin' ? undefined : createModel(settings);
  return buildPlan({ repos, settings, now: Date.now(), activeRecordId: await activeRecordId(), model, readPage, abortSignal });
}

export async function applyApprovedPlan(plan: PlanEntry[]): Promise<ApplyResult> {
  const result = await applyPlan(plan, repos, tabsApi);
  notifyChanged();
  return result;
}

export async function undo(runId: string): Promise<number> {
  const n = await undoRun(runId, repos, tabsApi);
  notifyChanged();
  return n;
}

export { ConfigError };
