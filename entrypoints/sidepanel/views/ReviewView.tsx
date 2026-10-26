import { useEffect, useMemo, useState } from 'react';
import { friendlyError, type PlanResult } from '@/src/lib/review';
import { ConfigError, applyApprovedPlan, generatePlan, repos, undo } from '@/src/lib/services';
import { hostOf } from '@/src/lib/format';
import type { Action, PlanEntry, TabRecord } from '@/src/lib/types';
import type { ApplyResult } from '@/src/lib/executor';

type State =
  | { step: 'loading' }
  | { step: 'plan'; plan: PlanResult }
  | { step: 'applied'; result: ApplyResult; undone: boolean }
  | { step: 'error'; message: string };

const GROUPS: { action: Action; title: string; hint: string }[] = [
  { action: 'task', title: 'Tasks', hint: 'Saved as to-dos, then closed' },
  { action: 'read', title: 'To read', hint: 'Saved for later, then closed' },
  { action: 'project', title: 'Projects', hint: 'Filed by project, then closed' },
  { action: 'done', title: 'Done', hint: 'Closed. Searchable for 30 days' },
];

export function ReviewView({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>({ step: 'loading' });
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [records, setRecords] = useState<Map<string, TabRecord>>(new Map());

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        const plan = await generatePlan(ctl.signal);
        // A cancelled run (panel closed, or React re-mounting in dev) must never show its result.
        if (ctl.signal.aborted) return;
        const open = await repos.tabs.listOpen();
        if (ctl.signal.aborted) return;
        setRecords(new Map(open.map((r) => [r.id, r])));
        setEntries(plan.entries);
        setState({ step: 'plan', plan });
      } catch (err) {
        if (!ctl.signal.aborted) setState({ step: 'error', message: err instanceof ConfigError ? err.message : friendlyError(err) });
      }
    })();
    return () => ctl.abort();
  }, []);

  const toggle = (id: string) => setEntries((es) => es.map((e) => (e.recordId === id ? { ...e, approved: !e.approved } : e)));
  const moving = useMemo(() => entries.filter((e) => e.action !== 'keep' && e.approved).length, [entries]);

  if (state.step === 'loading') {
    return (
      <section className="center" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <h2>Looking at your tabs</h2>
        <p>Sorting out what each one is for.</p>
      </section>
    );
  }

  if (state.step === 'error') {
    return (
      <section className="center">
        <h2>Couldn't build a plan</h2>
        <p>{state.message}</p>
        <button className="btn" onClick={onClose}>Back</button>
      </section>
    );
  }

  if (state.step === 'applied') {
    const { run, skipped } = state.result;
    const count = (a: Action) => run.applied.filter((x) => x.action === a).length;
    return (
      <section className="center" aria-live="polite">
        <h2>{state.undone ? 'Put everything back' : run.applied.length === 0 ? 'Nothing to change' : 'All clear'}</h2>
        {!state.undone && run.applied.length > 0 && (
          <p>
            Closed {run.applied.length} {run.applied.length === 1 ? 'tab' : 'tabs'}: {count('task')} tasks, {count('read')} to read, {count('project')} filed, {count('done')} done.
          </p>
        )}
        {skipped.length > 0 && <p className="muted">{skipped.length} left open because they were pinned, playing, or already closed.</p>}
        <div className="actions">
          {!state.undone && run.applied.length > 0 && (
            <button className="btn" onClick={async () => { await undo(run.id); setState({ ...state, undone: true }); }}>Undo</button>
          )}
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </section>
    );
  }

  const { plan } = state;
  const keepers = entries.filter((e) => e.action === 'keep');
  const total = records.size;

  return (
    <section className="review">
      <header className="review-head">
        <h2>End of day</h2>
        <p className="count">
          <s>{total}</s> → <strong>{total - moving}</strong> tabs
        </p>
      </header>
      <p className="muted">Here's my plan. Untick anything I got wrong and I'll remember next time.</p>
      {plan.warning && <p className="banner" role="status">{plan.warning}</p>}

      {GROUPS.map((g) => {
        const rows = entries.filter((e) => e.action === g.action);
        if (rows.length === 0) return null;
        return (
          <section key={g.action} className={`group group-${g.action}`}>
            <div className="group-head">
              <span className="chip">{rows.length}</span>
              <div>
                <h3>{g.title}</h3>
                <p className="muted">{g.hint}</p>
              </div>
            </div>
            <ul className="plan-list">
              {rows.map((e) => (
                <PlanRow key={e.recordId} entry={e} rec={records.get(e.recordId)} onToggle={() => toggle(e.recordId)} />
              ))}
            </ul>
          </section>
        );
      })}

      {keepers.length > 0 && (
        <details className="group group-keep">
          <summary><span className="chip">{keepers.length}</span> Staying open</summary>
          <ul className="plan-list">
            {keepers.map((e) => (
              <li key={e.recordId} className="plan-row static">
                <div className="row-main">
                  <div className="row-title">{records.get(e.recordId)?.title ?? 'Tab'}</div>
                  <div className="row-meta">{e.reason}</div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className="review-foot">
        {plan.usage && (
          <p className="muted">
            Used {(plan.usage.inputTokens + plan.usage.outputTokens).toLocaleString()} tokens, {plan.usage.pageReads} page {plan.usage.pageReads === 1 ? 'read' : 'reads'}.
          </p>
        )}
        <div className="actions">
          <button className="btn" onClick={onClose}>Not tonight</button>
          <button
            className="btn btn-primary"
            onClick={async () => setState({ step: 'applied', result: await applyApprovedPlan(entries), undone: false })}
          >
            Apply plan
          </button>
        </div>
        <p className="muted center-text">Everything closed can be undone or searched later.</p>
      </footer>
    </section>
  );
}

function PlanRow({ entry, rec, onToggle }: { entry: PlanEntry; rec?: TabRecord; onToggle: () => void }) {
  const title = entry.task?.title ?? rec?.title ?? 'Tab';
  return (
    <li className="plan-row">
      <label className="plan-label">
        <input type="checkbox" checked={entry.approved} onChange={onToggle} />
        <span className="row-main">
          <span className="row-title" title={title}>{title}</span>
          <span className="row-meta">
            {entry.reason}
            {entry.project ? ` · ${entry.project}` : ''}
            {entry.task?.due ? ` · due ${entry.task.due}` : ''}
          </span>
          {entry.flagged && <span className="flag">This page tried to give the agent instructions</span>}
        </span>
      </label>
      <details className="why">
        <summary>Why?</summary>
        <dl>
          <dt>Page</dt>
          <dd>{rec ? hostOf(rec.url) : 'unknown'}</dd>
          <dt>Decided by</dt>
          <dd>{{ rules: 'A built-in rule', memory: 'Your earlier choice', agent: 'The agent', fallback: 'A cautious default' }[entry.source]}</dd>
          {entry.looked && entry.looked.length > 0 && (<><dt>Looked at</dt><dd>{entry.looked.join(', ')}</dd></>)}
          {entry.summary && (<><dt>Summary</dt><dd>{entry.summary}</dd></>)}
          <dt>Confidence</dt>
          <dd>{Math.round(entry.confidence * 100)}%</dd>
        </dl>
      </details>
    </li>
  );
}
