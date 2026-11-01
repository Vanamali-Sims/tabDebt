import { useMemo, useState } from 'react';
import { Autocomplete } from '../Autocomplete';
import { CloseIcon, ReopenIcon } from '../Icons';
import { Tile } from '../Tile';
import type { ToastSpec } from '../Toast';
import { notifyChanged } from '@/src/lib/channel';
import { hostOf, timeAgo } from '@/src/lib/format';
import { searchClosed } from '@/src/lib/search';
import { buildVocabulary } from '@/src/lib/suggest';
import { repos, undo } from '@/src/lib/services';
import { useLive } from '@/src/lib/useAsync';
import type { SavedItem } from '@/src/lib/types';

export type SavedSegment = 'tasks' | 'read' | 'closed';

const open = (url: string) => void chrome.tabs.create({ url });
const DAY = 24 * 3_600_000;

export function SavedView({ segment, onSegment, toast }: {
  segment: SavedSegment;
  onSegment: (s: SavedSegment) => void;
  toast: (t: ToastSpec) => void;
}) {
  const [query, setQuery] = useState('');
  const items = useLive(() => repos.items.list());
  const closed = useLive(() => repos.tabs.listClosed());
  const lastRun = useLive(() => repos.runs.latest());

  const patch = async (item: SavedItem, change: Partial<SavedItem>) => {
    await repos.items.put({ ...item, ...change });
    notifyChanged();
  };
  const remove = async (item: SavedItem) => {
    await repos.items.delete(item.id);
    notifyChanged();
  };

  const vocabulary = useMemo(
    () => buildVocabulary([...(items ?? []).flatMap((i) => [i.title, i.summary ?? '', i.project ?? '']), ...(closed ?? []).flatMap((t) => [t.title, hostOf(t.url)])]),
    [items, closed],
  );
  const q = query.trim();
  const hits = q && items && closed ? searchClosed(q, closed, items) : [];
  const newest = (a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt;
  // Open tasks first, ticked ones sink to the bottom.
  const tasks = (items ?? []).filter((i) => i.kind === 'task').sort((a, b) => Number(a.done) - Number(b.done) || newest(a, b));
  const reads = (items ?? []).filter((i) => i.kind !== 'task').sort(newest);
  const recentClosed = [...(closed ?? [])].sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  const undoable = lastRun && !lastRun.undoneAt && Date.now() - lastRun.at < DAY ? lastRun : null;

  const segs: { id: SavedSegment; label: string; count: number }[] = [
    { id: 'tasks', label: 'Tasks', count: tasks.filter((t) => !t.done).length },
    { id: 'read', label: 'Read', count: reads.length },
    { id: 'closed', label: 'Closed', count: recentClosed.length },
  ];

  return (
    <section className="view">
      <div className="search">
        <Autocomplete label="Search saved and closed tabs" value={query} onChange={setQuery} vocabulary={vocabulary} placeholder="Search everything" />
      </div>

      {q ? (
        hits.length === 0 ? (
          <p className="empty">Nothing found for "{q}".</p>
        ) : (
          <ul style={{ marginTop: 8 }}>
            {hits.map((h) => (
              <li key={h.url + h.when} className="item-row">
                <span className="row-main">
                  <span className="row-title" title={h.title}>{h.title}</span>
                  <span className="row-meta">{hostOf(h.url)} · {h.kind === 'saved' ? 'saved' : 'closed'} {timeAgo(h.when)}{h.note ? ` · ${h.note}` : ''}</span>
                </span>
                <button className="icon-btn" aria-label={`Reopen ${h.title}`} onClick={() => open(h.url)}><ReopenIcon size={18} /></button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <div className="segmented" role="tablist" aria-label="Saved lists">
            {segs.map((s) => (
              <button key={s.id} role="tab" aria-selected={segment === s.id} onClick={() => onSegment(s.id)}>{s.label} {s.count}</button>
            ))}
          </div>

          {segment === 'tasks' && (tasks.length === 0 ? (
            <Empty title="No tasks" body="Tabs that are really to-dos land here after a review." />
          ) : (
            <ul>
              {tasks.map((t) => (
                <li key={t.id} className="item-row">
                  <label className="plan-label">
                    <input type="checkbox" checked={t.done} onChange={() => void patch(t, { done: !t.done })} />
                    <span className="row-main">
                      <span className={t.done ? 'row-title done' : 'row-title'}>{t.title}</span>
                      <span className="row-meta">{t.due ? `Due ${t.due} · ` : ''}{hostOf(t.url)}</span>
                    </span>
                  </label>
                  <button className="icon-btn" aria-label={`Open ${t.title}`} onClick={() => open(t.url)}><ReopenIcon size={18} /></button>
                </li>
              ))}
            </ul>
          ))}

          {segment === 'read' && (reads.length === 0 ? (
            <Empty title="Nothing to read" body="Articles and project tabs you save show up here." />
          ) : (
            <ul>
              {reads.map((r) => (
                <li key={r.id} className="item-row">
                  <Tile tab={{ url: r.url }} />
                  <span className="row-main">
                    <span className="row-title" title={r.title}>{r.title}</span>
                    <span className="row-meta">{r.project ? `${r.project} · ` : ''}{r.summary ?? hostOf(r.url)}</span>
                  </span>
                  <button className="icon-btn" aria-label={`Open ${r.title}`} onClick={() => open(r.url)}><ReopenIcon size={18} /></button>
                  <button className="icon-btn" aria-label={`Remove ${r.title}`} onClick={() => void remove(r)}><CloseIcon size={16} /></button>
                </li>
              ))}
            </ul>
          ))}

          {segment === 'closed' && (
            <>
              {undoable && (
                <div className="card" style={{ marginTop: 6, marginBottom: 6 }}>
                  <div className="link-row" style={{ cursor: 'default' }}>
                    <span className="grow">Last review closed {undoable.applied.length}, {timeAgo(undoable.at)}</span>
                    <button className="text-btn" onClick={async () => { const n = await undo(undoable.id); toast({ text: `${n} tabs reopened`, ms: 4000 }); }}>Undo</button>
                  </div>
                </div>
              )}
              {recentClosed.length === 0 ? (
                <Empty title="Nothing closed yet" body="Closed tabs stay searchable here for 30 days." />
              ) : (
                <ul>
                  {recentClosed.slice(0, 60).map((t) => (
                    <li key={t.id} className="item-row">
                      <Tile tab={t} />
                      <span className="row-main">
                        <span className="row-title" title={t.title}>{t.title || hostOf(t.url)}</span>
                        <span className="row-meta">{hostOf(t.url)} · {t.closedBy === 'agent' ? 'cleared' : 'closed'} {timeAgo(t.closedAt ?? Date.now())}</span>
                      </span>
                      <button className="icon-btn" aria-label={`Reopen ${t.title}`} onClick={() => open(t.url)}><ReopenIcon size={18} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
