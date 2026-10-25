import type { Repos } from './types';

export const RETENTION_DAYS = 30;

/**
 * Forgets closed tabs and old review runs after 30 days, matching what the panel promises.
 * Saved items (tasks, reading list, projects) are the user's own list and are never pruned.
 */
export async function prune(repos: Repos, now: number = Date.now(), days = RETENTION_DAYS): Promise<{ tabs: number; runs: number }> {
  const cutoff = now - days * 24 * 3_600_000;
  let tabs = 0;
  let runs = 0;
  for (const t of await repos.tabs.listClosed()) {
    if ((t.closedAt ?? 0) < cutoff) {
      await repos.tabs.delete(t.id);
      tabs++;
    }
  }
  for (const r of await repos.runs.list()) {
    if (r.at < cutoff) {
      await repos.runs.delete(r.id);
      runs++;
    }
  }
  return { tabs, runs };
}
