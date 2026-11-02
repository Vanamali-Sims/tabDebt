import { useEffect, useMemo, useRef, useState } from 'react';
import { BackIcon } from '../Icons';
import { Tile } from '../Tile';
import { friendlyError, type PlanResult } from '@/src/lib/review';
import { ConfigError, applyReview, generatePlan, repos } from '@/src/lib/services';
import { hostOf } from '@/src/lib/format';
import type { Action, PlanEntry, TabRecord } from '@/src/lib/types';
import type { ApplyResult } from '@/src/lib/executor';

type State =
  | { step: 'loading' }
  | { step: 'plan'; plan: PlanResult; seconds: number }
  | { step: 'error'; message: string };

const SAVE_ACTIONS: Action[] = ['task', 'read', 'project'];
const TAG: Record<Exclude<Action, 'done' | 'keep'>, string> = { task: 'Task', read: 'Read', project: 'Project' };
const DECIDED_BY: Record<PlanEntry['source'], string> = { rules: 'A built-in rule', memory: 'Your earlier choice', agent: 'The AI', fallback: 'A cautious default', user: 'You' };

export function ReviewView({ onClose, onApplied }: { onClose: () => void; onApplied: (r: ApplyResult) => void }) {
  const [state, setState] = useState<State>({ step: 'loading' });
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [records, setRecords] = useState<Map<string, TabRecord>>(new Map());
  const [applying, setApplying] = useState(false);
  const started = useRef(Date.now());

  useEffect(() => {
    const ctl = new AbortController();
    started.current = Date.now();
    (async () => {
      try {
        const plan = await generatePlan(ctl.signal);
        // A cancelled run (panel closed, or React re-mounting in dev) must never show its result.
        if (ctl.signal.aborted) return;
        const open = await repos.tabs.listOpen();
        if (ctl.signal.aborted) return;
        setRecords(new Map(open.map((r) => [r.id, r])));
        setEntries(plan.entries);
        setState({ step: 'plan', plan, seconds: Math.max(1, Math.round((Date.now() - started.current) / 1000)) });
      } catch (err) {
        if (!ctl.signal.aborted) setState({ step: 'error', message: err instanceof ConfigError ? err.message : friendlyError(err) });
      }
    })();
    return () => ctl.abort();
  }, []);

  const toggle = (id: string) => setEntries((es) => es.map((e) => (e.recordId === id ? { ...e, approved: !e.approved } : e)));
  const n = useMemo(() => {
    const on = (e: PlanEntry) => e.action !== 'keep' && e.approved;
    const close = entries.filter(on).length;
    const save = entries.filter((e) => on(e) && SAVE_ACTIONS.includes(e.action)).length;
    return { close, save, keep: entries.length - close };
  }, [entries]);

  const head = (meta?: string) => (
    <header className="review-head">
      <button className="icon-btn" aria-label="Back" onClick={onClose}><BackIcon size={20} /></button>
      <h2>Review</h2>
      {meta && <span className="meta">{meta}</span>}
    </header>
  );

  if (state.step === 'loading') {
    return (
      <section className="view">
        {head()}
        <div className="center" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <h2>Looking at your tabs</h2>
          <p>Working out which ones you're done with.</p>
        </div>
      </section>
    );
  }

  if (state.step === 'error') {
    return (
      <section className="view">
        {head()}
        <div className="center">
          <h2>Couldn't build a plan</h2>
          <p>{state.message}</p>
          <button className="pill pill-quiet pill-sm" onClick={onClose}>Back</button>
        </div>
      </section>
    );
  }

  const { plan, seconds } = state;
  const done = entries.filter((e) => e.action === 'done');
  const saves = entries.filter((e) => SAVE_ACTIONS.includes(e.action));
  const keepers = entries.filter((e) => e.action === 'keep');
  const apply = async () => {
    setApplying(true);
    onApplied(await applyReview(entries));
  };
  const label = n.close === 0 ? 'Nothing to close' : n.save > 0 ? `Close ${n.close} · Save ${n.save}` : `Close ${n.close}`;

  return (
    <section className="view" style={{ paddingBottom: 0 }}>
      {head(`${records.size} tabs · ${seconds}s`)}
      <div className="counters">
        <div className="counter"><strong>{n.close}</strong><span>Close</span></div>
        <div className="counter"><strong>{n.save}</strong><span>Save</span></div>
        <div className="counter"><strong>{n.keep}</strong><span>Keep open</span></div>
      </div>
      {plan.warning && <p className="warn" role="status">{plan.warning}</p>}

      {done.length > 0 && (
        <div className="section">
          <div className="section-head"><h3 className="section-label">Done</h3><span className="section-hint">Untick to keep</span></div>
          <ul>{done.map((e) => <PlanRow key={e.recordId} entry={e} rec={records.get(e.recordId)} onToggle={() => toggle(e.recordId)} />)}</ul>
        </div>
      )}

      {saves.length > 0 && (
        <div className="section">
          <div className="section-head"><h3 className="section-label">Save</h3><span className="section-hint">Then close</span></div>
          <ul>{saves.map((e) => <PlanRow key={e.recordId} entry={e} rec={records.get(e.recordId)} onToggle={() => toggle(e.recordId)} />)}</ul>
        </div>
      )}

      {keepers.length > 0 && (
        <div className="section">
          <div className="section-head"><h3 className="section-label">Keep open</h3></div>
          <ul>
            {keepers.map((e) => {
              const rec = records.get(e.recordId);
              return (
                <li key={e.recordId} className="plan-row" data-action="keep">
                  {rec ? <Tile tab={rec} /> : null}
                  <span className="row-main">
                    <span className="row-title">{rec?.title ?? 'Tab'}</span>
                    <span className={e.source === 'fallback' || e.confidence < 0.6 ? 'row-meta amber' : 'row-meta'}>{e.source === 'fallback' ? 'Unsure, so it stays' : e.reason}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <footer className="review-foot">
        <button className="pill pill-block" onClick={() => void apply()} disabled={applying || n.close === 0}>{label}</button>
        <div className="row">
          <button className="text-btn quiet" onClick={onClose}>Not tonight</button>
          <span aria-hidden="true">·</span>
          <span>Undo anytime for 30 days</span>
        </div>
        {plan.usage && plan.usage.inputTokens + plan.usage.outputTokens > 0 && (
          <p className="muted" style={{ fontSize: 12 }}>
            {(plan.usage.inputTokens + plan.usage.outputTokens).toLocaleString()} tokens · {plan.usage.pageReads} page {plan.usage.pageReads === 1 ? 'read' : 'reads'}
          </p>
        )}
      </footer>
    </section>
  );
}

function PlanRow({ entry, rec, onToggle }: { entry: PlanEntry; rec?: TabRecord; onToggle: () => void }) {
  const [why, setWhy] = useState(false);
  const title = entry.task?.title ?? rec?.title ?? 'Tab';
  const meta = [entry.reason, entry.project, entry.task?.due ? `due ${entry.task.due}` : ''].filter(Boolean).join(' · ');
  const tag = entry.action === 'task' || entry.action === 'read' || entry.action === 'project' ? entry.action : null;
  return (
    <li data-action={entry.action}>
      <div className="plan-row">
        <label className="plan-label">
          <input type="checkbox" checked={entry.approved} onChange={onToggle} />
          {tag && <span className={`tag tag-${tag}`}>{TAG[tag]}</span>}
          <span className="row-main">
            <span className={entry.approved ? 'row-title' : 'row-title off'} title={title}>{title}</span>
            <span className="row-meta">{meta}</span>
            {entry.flagged && <span className="flag">This page tried to give the AI instructions</span>}
          </span>
        </label>
        <button className="why-btn" aria-expanded={why} aria-label={`Why: ${title}`} onClick={() => setWhy((w) => !w)}>Why</button>
      </div>
      {why && (
        <dl className="why">
          <dt>Page</dt>
          <dd>{rec ? hostOf(rec.url) : 'unknown'}</dd>
          <dt>Decided by</dt>
          <dd>{DECIDED_BY[entry.source]}</dd>
          {entry.looked && entry.looked.length > 0 && (<><dt>Looked at</dt><dd>{entry.looked.join(', ')}</dd></>)}
          {entry.summary && (<><dt>Summary</dt><dd>{entry.summary}</dd></>)}
          <dt>Confidence</dt>
          <dd>{Math.round(entry.confidence * 100)}%</dd>
        </dl>
      )}
    </li>
  );
}
