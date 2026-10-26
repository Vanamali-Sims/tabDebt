import type { LanguageModel } from 'ai';
import { runAgent, type AgentOutput, type PageSnapshot } from './agent/agent';
import { finalizeVerdicts } from './agent/finalize';
import { classifyByRules } from './rules';
import type { Settings } from './settings';
import type { PlanEntry, Repos, TabRecord, Verdict } from './types';

/** Suggestions below this start unticked, so the person opts in to the uncertain ones. */
export const PRE_APPROVE_CONFIDENCE = 0.6;

export interface PlanResult {
  entries: PlanEntry[];
  usage?: AgentOutput['usage'];
  counts: Record<Verdict['source'], number>;
  /** Set when the agent could not run and the plan came from rules alone. */
  warning?: string;
}

export interface BuildPlanOptions {
  repos: Repos;
  settings: Settings;
  now: number;
  activeRecordId?: string;
  /** Absent in built-in mode. */
  model?: LanguageModel;
  readPage?: (tabId: number) => Promise<PageSnapshot | null>;
  abortSignal?: AbortSignal;
}

/**
 * The whole review: free rules first, the agent only for what is left, and a cautious fallback
 * for anything still undecided. Nothing here changes a tab. It only produces a plan to approve.
 */
export async function buildPlan(opts: BuildPlanOptions): Promise<PlanResult> {
  const { repos, settings, now } = opts;
  const open = await repos.tabs.listOpen();
  const everything = [...open, ...(await repos.tabs.listClosed())];
  const memory = await repos.memory.list();
  const items = await repos.items.list();

  const hasChildren = new Set<string>();
  for (const r of everything) if (r.openerRecordId) hasChildren.add(r.openerRecordId);

  const { decided, unresolved } = classifyByRules(open, {
    now,
    activeRecordId: opts.activeRecordId,
    exclusions: settings.exclusions,
    memory,
    hasChildren,
  });

  let verdicts: Verdict[] = [...decided];
  let usage: AgentOutput['usage'] | undefined;
  let warning: string | undefined;

  // Stalest first, so the budget goes to the tabs most likely to be forgotten.
  const queue = [...unresolved].sort((a, b) => a.lastActiveAt - b.lastActiveAt);
  const forAgent = opts.model ? queue.slice(0, settings.maxTabsPerRun) : [];
  const forFallback: TabRecord[] = queue.filter((t) => !forAgent.includes(t));

  if (forAgent.length > 0 && opts.model) {
    try {
      const out = await runAgent({
        model: opts.model,
        tabs: forAgent,
        allRecords: everything,
        readPage: settings.readPageText ? opts.readPage : undefined,
        projectHints: [...new Set(items.map((i) => i.project).filter((p): p is string => !!p))],
        now,
        maxSteps: settings.maxSteps,
        abortSignal: opts.abortSignal,
      });
      verdicts = verdicts.concat(out.verdicts);
      usage = out.usage;
      if (opts.abortSignal?.aborted) throw out.error ?? new Error('Cancelled');
      if (out.error) warning = friendlyError(out.error).replace('Showing the built-in suggestions only.', 'Some tabs use the built-in suggestions.');
    } catch (err) {
      // Cancelled on purpose: stop, don't present a rule-only plan as if the AI had failed.
      if (opts.abortSignal?.aborted) throw err;
      warning = friendlyError(err);
      forFallback.push(...forAgent);
    }
  }

  if (forFallback.length > 0) {
    const refs = new Map(forFallback.map((t, i) => [`t${i + 1}`, t]));
    verdicts = verdicts.concat(finalizeVerdicts(refs, new Map(), new Map(), new Set(), now));
  }

  const counts: PlanResult['counts'] = { rules: 0, memory: 0, agent: 0, fallback: 0, user: 0 };
  for (const v of verdicts) counts[v.source]++;

  const entries: PlanEntry[] = verdicts.map((v) => ({
    ...v,
    approved: v.action !== 'keep' && v.confidence >= PRE_APPROVE_CONFIDENCE,
  }));
  return { entries, usage, counts, warning };
}

export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|403|unauthor|invalid.*key|incorrect api key/i.test(msg)) return "Your AI provider didn't accept the key. Check it in settings. Showing the built-in suggestions only.";
  if (/429|rate|quota|insufficient/i.test(msg)) return 'Your AI provider says the limit or balance is used up. Showing the built-in suggestions only.';
  if (/failed to fetch|network|ECONN|fetch failed/i.test(msg)) return "Couldn't reach your AI provider. Showing the built-in suggestions only.";
  return `The AI step failed (${msg.slice(0, 120)}). Showing the built-in suggestions only.`;
}
