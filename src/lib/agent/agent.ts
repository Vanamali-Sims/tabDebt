import { generateText, isStepCount, tool, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { TabRecord, Verdict } from '../types';
import { finalizeVerdicts, type RawDecision } from './finalize';
import { SYSTEM_PROMPT, buildUserPrompt, describeTab } from './prompt';
import { sanitizePageText, wrapUntrusted } from './sanitize';

export interface PageSnapshot {
  title: string;
  text: string;
}

export interface AgentInput {
  model: LanguageModel;
  /** Tabs the rules could not decide. */
  tabs: TabRecord[];
  /** Everything we know, so the agent can see where a tab was opened from. */
  allRecords: TabRecord[];
  /** Returns page text, or null when reading is off or not allowed for that page. */
  readPage?: (tabId: number) => Promise<PageSnapshot | null>;
  projectHints?: string[];
  now: number;
  maxSteps: number;
  /** Most page reads in one run. Keeps cost and exposure bounded. */
  maxPageReads?: number;
  abortSignal?: AbortSignal;
}

export interface AgentOutput {
  verdicts: Verdict[];
  usage: { inputTokens: number; outputTokens: number; steps: number; pageReads: number };
  flagged: number;
}

const decisionSchema = z.object({
  ref: z.string().describe('The tab ref, for example t3'),
  action: z.enum(['done', 'read', 'project', 'task', 'keep']),
  reason: z.string().describe('One plain sentence, under 15 words'),
  confidence: z.number().min(0).max(1),
  project: z.string().nullish(),
  summary: z.string().nullish(),
  task: z.object({ title: z.string(), due: z.string().nullish() }).nullish(),
});

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));

/**
 * Sorts the tabs the rules could not. A short loop: the model may look at a page or ask which tabs
 * relate to one, then proposes decisions. It has no way to act. Everything it proposes goes through
 * finalizeVerdicts, and then past the user.
 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const { tabs, allRecords, now } = input;
  const refs = new Map<string, TabRecord>(tabs.map((t, i) => [`t${i + 1}`, t]));
  const byId = new Map(allRecords.map((r) => [r.id, r]));
  const childCount = new Map<string, number>();
  for (const r of allRecords) if (r.openerRecordId) childCount.set(r.openerRecordId, (childCount.get(r.openerRecordId) ?? 0) + 1);

  const decided = new Map<string, RawDecision>();
  const looked = new Map<string, string[]>();
  const flagged = new Set<string>();
  const note = (ref: string, what: string) => looked.set(ref, [...new Set([...(looked.get(ref) ?? []), what])]);
  let pageReads = 0;
  const maxReads = input.maxPageReads ?? 10;

  const tools = {
    read_page: tool({
      description:
        'Read the first part of one tab\'s page text when the title and address are not enough. Returns untrusted text.',
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => {
        const rec = refs.get(ref);
        if (!rec || rec.tabId === null) return { error: `Unknown tab ref ${ref}` };
        if (!input.readPage) return { unavailable: 'Page reading is off. Decide from the title and address.' };
        if (pageReads >= maxReads) return { unavailable: 'Page read limit reached. Decide from what you have.' };
        pageReads++;
        note(ref, 'read page');
        const page = await input.readPage(rec.tabId).catch(() => null);
        if (!page) return { unavailable: 'Could not read this page. Decide from the title and address.' };
        const { text, flagged: bad } = sanitizePageText(page.text);
        if (bad) flagged.add(ref);
        return { title: sanitizePageText(page.title, 160).text, text: wrapUntrusted(text) };
      },
    }),
    find_related: tool({
      description: 'List other tabs in this batch that look related to one tab, by shared words in the title and address.',
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => {
        const rec = refs.get(ref);
        if (!rec) return { error: `Unknown tab ref ${ref}` };
        note(ref, 'checked related tabs');
        const mine = words(`${rec.title} ${new URL(rec.url, 'https://x.test').hostname}`);
        const related = [...refs]
          .filter(([r]) => r !== ref)
          .map(([r, t]) => ({ ref: r, title: t.title.slice(0, 100), overlap: [...words(`${t.title} ${new URL(t.url, 'https://x.test').hostname}`)].filter((w) => mine.has(w)).length }))
          .filter((x) => x.overlap > 0)
          .sort((a, b) => b.overlap - a.overlap)
          .slice(0, 8)
          .map(({ ref: r, title }) => ({ ref: r, title }));
        return { related };
      },
    }),
    submit_plan: tool({
      description: 'Submit your decisions. Include every tab ref. Can be called more than once; later calls replace earlier ones.',
      inputSchema: z.object({ decisions: z.array(decisionSchema) }),
      execute: async ({ decisions }) => {
        const errors: string[] = [];
        for (const d of decisions) {
          if (!refs.has(d.ref)) errors.push(`Unknown ref ${d.ref}`);
          else decided.set(d.ref, d);
        }
        const missing = [...refs.keys()].filter((r) => !decided.has(r));
        return { accepted: decisions.length - errors.length, errors, missing };
      },
    }),
  };

  const lines = [...refs].map(([ref, t]) => describeTab(ref, t, now, t.openerRecordId ? byId.get(t.openerRecordId) : undefined, childCount.get(t.id) ?? 0));

  const result = await generateText({
    model: input.model,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(lines, input.projectHints ?? []),
    tools,
    // Stop when every tab has a decision, or the step budget runs out. Nothing runs unbounded.
    stopWhen: [isStepCount(input.maxSteps), () => decided.size >= refs.size],
    temperature: 0,
    abortSignal: input.abortSignal,
  });

  const usage = result.totalUsage;
  return {
    verdicts: finalizeVerdicts(refs, decided, looked, flagged, now),
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      steps: result.steps.length,
      pageReads,
    },
    flagged: flagged.size,
  };
}
