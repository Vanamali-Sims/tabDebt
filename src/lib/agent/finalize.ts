import type { Action, TabRecord, TaskDraft, Verdict } from '../types';

/** The agent's raw proposal for one tab, before our own checks. */
export interface RawDecision {
  ref: string;
  action: Action;
  reason: string;
  confidence: number;
  project?: string | null;
  summary?: string | null;
  task?: { title: string; due?: string | null } | null;
}

/** Below this, closing a tab is not allowed: the tab is saved to read instead. */
export const CLOSE_CONFIDENCE = 0.7;
const STALE_MS = 2 * 24 * 3_600_000;

const clean = (s: string | null | undefined, max: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Turns the agent's proposals into verdicts, applying our own rules on top. The model suggests; this
 * decides what is allowed. Unsure never means closed, and a flagged page is always left alone.
 */
export function finalizeVerdicts(
  tabs: Map<string, TabRecord>, // ref -> record
  raw: Map<string, RawDecision>,
  looked: Map<string, string[]>,
  flagged: Set<string>,
  now: number,
): Verdict[] {
  const out: Verdict[] = [];
  for (const [ref, rec] of tabs) {
    const d = raw.get(ref);
    const base = { recordId: rec.id, looked: looked.get(ref) ?? [] };

    if (flagged.has(ref)) {
      out.push({ ...base, action: 'keep', confidence: 1, source: 'agent', flagged: true, reason: 'This page tried to give the agent instructions, so it was left alone' });
      continue;
    }
    if (!d) {
      // The agent did not decide: only suggest reading what has gone stale, never close.
      const stale = now - rec.lastActiveAt > STALE_MS;
      out.push({ ...base, action: stale ? 'read' : 'keep', confidence: 0.4, source: 'fallback', reason: stale ? "Haven't looked at this in a while" : 'Not sure, so leaving it' });
      continue;
    }

    let action = d.action;
    let reason = clean(d.reason, 140) || 'No reason given';
    const confidence = Math.min(1, Math.max(0, Number.isFinite(d.confidence) ? d.confidence : 0));
    const project = clean(d.project, 60) || undefined;
    const taskTitle = clean(d.task?.title, 120);
    const task: TaskDraft | undefined = taskTitle ? { title: taskTitle, due: clean(d.task?.due, 40) || undefined } : undefined;

    if (action === 'done' && confidence < CLOSE_CONFIDENCE) {
      action = 'read';
      reason = `${reason} (not sure enough to close)`;
    }
    if (action === 'task' && !task) action = 'read';
    if (action === 'project' && !project) action = 'read';

    out.push({
      ...base,
      action,
      reason,
      confidence,
      source: 'agent',
      project: action === 'project' ? project : undefined,
      task: action === 'task' ? task : undefined,
      summary: action === 'done' || action === 'keep' ? undefined : clean(d.summary, 240) || undefined,
    });
  }
  return out;
}
