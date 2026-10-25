import { hostOf } from './format';
import type { AppliedDecision, PlanEntry, Repos, Run, SavedItem } from './types';

/** The two things the executor needs from the browser. Faked in tests. */
export interface TabsApi {
  remove(tabId: number): Promise<void>;
  create(url: string): Promise<void>;
}

export interface ApplyResult {
  run: Run;
  skipped: { recordId: string; reason: string }[];
}

/**
 * Carries out a plan the user approved. This is the only code that closes tabs or saves items,
 * and it re-checks every tab itself: a pinned, playing or already-closed tab is never touched,
 * whatever the plan says.
 */
export async function applyPlan(
  plan: PlanEntry[],
  repos: Repos,
  tabs: TabsApi,
  now: () => number = Date.now,
): Promise<ApplyResult> {
  const t = now();
  const runId = crypto.randomUUID();
  const applied: AppliedDecision[] = [];
  const skipped: ApplyResult['skipped'] = [];

  for (const entry of plan) {
    const rec = await repos.tabs.get(entry.recordId);
    if (!rec) continue;

    if (!entry.approved) {
      // A correction: the user wanted this tab left alone, so remember the site.
      if (entry.action !== 'keep') await rememberKeep(hostOf(rec.url), repos, t);
      continue;
    }
    if (entry.action === 'keep') continue;

    if (rec.closedAt !== undefined || rec.tabId === null) {
      skipped.push({ recordId: rec.id, reason: 'Already closed' });
      continue;
    }
    if (rec.pinned || rec.audible) {
      skipped.push({ recordId: rec.id, reason: rec.pinned ? 'Pinned' : 'Playing audio' });
      continue;
    }

    let itemId: string | undefined;
    if (entry.action !== 'done') {
      const item: SavedItem = {
        id: crypto.randomUUID(),
        kind: entry.action,
        title: entry.task?.title ?? rec.title,
        url: rec.url,
        summary: entry.summary,
        project: entry.project,
        due: entry.task?.due,
        done: false,
        createdAt: t,
        runId,
      };
      await repos.items.put(item);
      itemId = item.id;
    }

    // Mark the record closed before the tab goes, so the background worker's
    // tab-removed handler sees nothing open and does not record "user" as the closer.
    const tabId = rec.tabId;
    await repos.tabs.put({ ...rec, tabId: null, closedAt: t, closedBy: 'agent' });
    await tabs.remove(tabId).catch(() => {});
    applied.push({ recordId: rec.id, action: entry.action, url: rec.url, title: rec.title, itemId });
  }

  const run: Run = { id: runId, at: t, applied };
  if (applied.length > 0) await repos.runs.put(run);
  return { run, skipped };
}

/** Reopen every tab a run closed and remove what it saved. Safe to call twice. */
export async function undoRun(runId: string, repos: Repos, tabs: TabsApi, now: () => number = Date.now): Promise<number> {
  const run = await repos.runs.get(runId);
  if (!run || run.undoneAt) return 0;
  for (const a of run.applied) {
    await tabs.create(a.url);
    if (a.itemId) await repos.items.delete(a.itemId);
  }
  await repos.runs.put({ ...run, undoneAt: now() });
  return run.applied.length;
}

async function rememberKeep(host: string, repos: Repos, t: number) {
  if (!host) return;
  const existing = await repos.memory.get(host);
  await repos.memory.put({ host, action: 'keep', count: (existing?.count ?? 0) + 1, updatedAt: t });
}
