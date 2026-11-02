import { ConfigError, createModel } from './agent/models';
import { deviceStatus, runDeviceAgent, type DeviceStatus } from './agent/device';
import { isEvening, makeBrief, saveBrief } from './brief';
import { afterReview, effectiveFinish, loadLastActive, loadLog, saveLog } from './nudge';
import { idbRepos } from './db';
import { notifyChanged } from './channel';
import { applyPlan, undoRun, type ApplyResult, type TabsApi } from './executor';
import { readPage } from './page';
import { collectPageState, probeTab } from './pagestate';
import { homeBasePages, loadPageDays } from './homebase';
import { isExcluded } from './rules';
import { buildPlan, type PlanResult } from './review';
import { loadSettings } from './settings';
import type { PlanEntry } from './types';

/** The panel's one connection to storage and the browser. UI code goes through here. */
export const repos = idbRepos();

export const tabsApi: TabsApi = {
  remove: (id) => chrome.tabs.remove(id),
  create: async (url) => void (await chrome.tabs.create({ url, active: false })),
  // Someone may have started typing between the review and pressing Close.
  stillSafeToClose: async (id) => {
    const { checkTyping } = await loadSettings();
    if (!checkTyping) return null;
    return (await probeTab(id, { video: false, typing: true }))?.typing ? 'You started typing here' : null;
  },
};

export async function activeRecordId(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return undefined;
  return (await repos.tabs.getOpenByTabId(tab.id))?.id;
}

export async function generatePlan(abortSignal?: AbortSignal): Promise<PlanResult> {
  const settings = await loadSettings();
  const open = await repos.tabs.listOpen();
  const pageState = await collectPageState(open, { video: settings.checkVideo, typing: settings.checkTyping }, (url) => isExcluded(url, settings.exclusions));
  const homeBase = homeBasePages(await loadPageDays());
  const base = { repos, settings, now: Date.now(), activeRecordId: await activeRecordId(), readPage, abortSignal, pageState, homeBase };
  if (settings.mode === 'builtin') return buildPlan(base);
  if (settings.mode === 'device') {
    // Not ready on this computer: sort with the rules and say why, rather than failing the review.
    const status = await deviceStatus();
    if (status !== 'available') return buildPlan({ ...base, unavailableNote: deviceNote(status) });
    return buildPlan({ ...base, device: runDeviceAgent });
  }
  // A bad key or model name surfaces as a ConfigError the screen shows as a plain message.
  return buildPlan({ ...base, model: createModel(settings) });
}

/** Why the on-device model couldn't be used, in plain words. */
export function deviceNote(status: DeviceStatus): string {
  if (status === 'downloadable') return 'The on-device AI needs a one-time download. Start it in Settings. Showing the built-in suggestions for now.';
  if (status === 'downloading') return 'The on-device AI is still downloading. Showing the built-in suggestions for now.';
  return "The on-device AI isn't available in this browser. Showing the built-in suggestions only. You can add your own key in Settings.";
}

export async function applyApprovedPlan(plan: PlanEntry[]): Promise<ApplyResult> {
  const result = await applyPlan(plan, repos, tabsApi);
  notifyChanged();
  return result;
}

/**
 * Applies a review. In the evening, a review is the wrap-up: it also writes tomorrow's brief from the
 * tabs left open, so the morning view is ready without another AI call.
 */
export async function applyReview(plan: PlanEntry[], now: Date = new Date()): Promise<ApplyResult> {
  const result = await applyApprovedPlan(plan);
  if (result.run.applied.length === 0) return result;
  // A review answers today's "Finishing up?", wherever it came from.
  await saveLog(afterReview(await loadLog(), now));
  await chrome.storage.session.set({ wrapUpAsk: null });
  const finish = effectiveFinish((await loadSettings()).finishMinutes, await loadLastActive(), now);
  if (isEvening(now, finish)) {
    const open = await repos.tabs.listOpen();
    await saveBrief(makeBrief({ kind: 'wrapped', open, now, closedCount: result.run.applied.length, runId: result.run.id }));
    notifyChanged();
  }
  return result;
}

export async function undo(runId: string): Promise<number> {
  const n = await undoRun(runId, repos, tabsApi);
  notifyChanged();
  return n;
}

export { ConfigError };
