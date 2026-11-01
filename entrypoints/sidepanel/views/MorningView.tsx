import { useState } from 'react';
import { ChevronIcon } from '../Icons';
import { Tile } from '../Tile';
import type { SavedSegment } from './SavedView';
import { dismissBrief, loadBrief, pickUpMeta } from '@/src/lib/brief';
import { notifyChanged } from '@/src/lib/channel';
import { hostOf } from '@/src/lib/format';
import { reopenAsGroup } from '@/src/lib/reopen';
import { repos } from '@/src/lib/services';
import { useLive } from '@/src/lib/useAsync';
import type { SavedItem } from '@/src/lib/types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Here's where you left off": one thing to pick up, today's tasks, and the way back to everything else. */
export function MorningView({ onDone, onReview, onOpenSaved }: {
  onDone: () => void;
  onReview: () => void;
  onOpenSaved: (seg: SavedSegment) => void;
}) {
  const brief = useLive(() => loadBrief());
  const items = useLive(() => repos.items.list());
  const [opened, setOpened] = useState(false);

  const tasks = (items ?? []).filter((i) => i.kind === 'task').sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt).slice(0, 4);
  const left = tasks.filter((t) => !t.done).length;
  const reads = (items ?? []).filter((i) => i.kind !== 'task').length;
  const toggle = async (t: SavedItem) => {
    await repos.items.put({ ...t, done: !t.done });
    notifyChanged();
  };
  const finish = async () => {
    await dismissBrief();
    notifyChanged();
    onDone();
  };

  if (!brief) return null;
  const p = brief.pickUp;

  return (
    <section className="view">
      <p className="morning-sub">Here's where you left off</p>

      {brief.kind === 'unreviewed' && brief.openCount > 0 && (
        <div className="card banner-card">
          <div className="card-pad">
            <span className="card-title">You didn't wrap up yesterday</span>
            <span className="card-body">Sort those {plural(brief.openCount, 'tab')} now?</span>
            <div className="card-actions"><button className="pill pill-sm" onClick={onReview}>Review tabs</button></div>
          </div>
        </div>
      )}

      {p && (
        <div className="card pickup">
          <div className="card-pad">
            <span className="eyebrow">Pick up here</span>
            <span className="pickup-title">{p.title}</span>
            <span className="pickup-meta">
              <span className="tile-stack" aria-hidden="true">{p.tabs.map((t) => <Tile key={t.url} tab={t} />)}</span>
              {pickUpMeta(p)}
            </span>
            <button className={opened ? 'pill pill-quiet' : 'pill'} onClick={async () => { await reopenAsGroup(p); setOpened(true); }}>
              {opened ? 'Opened as a tab group' : p.tabs.length > 1 ? `Reopen ${p.tabs.length} tabs` : `Open ${hostOf(p.tabs[0]!.url)}`}
            </button>
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2 className="section-label">Today</h2>
            {left > 0 && <span className="section-hint amber-text">{left} left</span>}
          </div>
          <ul>
            {tasks.map((t) => (
              <li key={t.id} className="item-row">
                <label className="plan-label">
                  <input type="checkbox" checked={t.done} onChange={() => void toggle(t)} />
                  <span className="row-main">
                    <span className={t.done ? 'row-title done' : 'row-title'}>{t.title}</span>
                    <span className="row-meta">{t.due ? `Due ${t.due}` : hostOf(t.url)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(reads > 0 || brief.closedCount > 0) && (
        <div className="card" style={{ marginTop: 12 }}>
          {reads > 0 && (
            <button className="link-row" onClick={() => onOpenSaved('read')}>
              <span className="grow">To read</span><span className="count-r">{reads}</span><ChevronIcon size={16} />
            </button>
          )}
          {brief.closedCount > 0 && (
            <button className="link-row" onClick={() => onOpenSaved('cleared')}>
              <span className="grow">Cleared last night</span><span className="count-r">{brief.closedCount}</span><ChevronIcon size={16} />
            </button>
          )}
        </div>
      )}

      <button className="text-btn quiet" style={{ alignSelf: 'center', marginTop: 12 }} onClick={() => void finish()}>Done for today</button>
    </section>
  );
}
