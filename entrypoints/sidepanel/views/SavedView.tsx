import { useMemo, useState } from 'react';
import { Autocomplete } from '../Autocomplete';
import { CloseIcon, ReopenIcon } from '../Icons';
import { Tile } from '../Tile';
import type { ToastSpec } from '../Toast';
import { notifyChanged } from '@/src/lib/channel';
import { hostOf, timeAgo } from '@/src/lib/format';
import { clearedGroups, clearedNote, clearedThisWeek } from '@/src/lib/cleared';
import { searchClosed } from '@/src/lib/search';
import { buildVocabulary } from '@/src/lib/suggest';
import { repos, undo } from '@/src/lib/services';
import { useLive } from '@/src/lib/useAsync';
import type { SavedItem } from '@/src/lib/types';

export type SavedSegment = 'tasks' | 'read' | 'cleared';

const open = (url: string) => void chrome.tabs.create({ url });

export function SavedView({ segment, onSegment, toast }: {
  segment: SavedSegment;
  onSegment: (s: SavedSegment) => void;
  toast: (t: ToastSpec) => void;
}) {
  const [query, setQuery] = useState('');
  const items = useLive(() => repos.items.list());
  // Only what tabDebt closed. Tabs you closed yourself are the browser's history, not ours.
  const closed = useLive(async () => (await repos.tabs.listClosed()).filter((t) => t.closedBy === 'agent'));
  const runs = useLive(() => repos.runs.list());

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
  const now = Date.now();
  const groups = clearedGroups(runs ?? [], now);

  const segs: { id: SavedSegment; label: string; count: number }[] = [
    { id: 'tasks', label: 'Tasks', count: tasks.filter((t) => !t.done).length },
    { id: 'read', label: 'Read', count: reads.length },
    { id: 'cleared', label: 'Cleared', count: clearedThisWeek(groups, now) },
  ];

  return (
    <section className="view">
      <div className="search">
        <Autocomplete label="Search saved tabs and tabs tabDebt cleared" value={query} onChange={setQuery} vocabulary={vocabulary} placeholder="Search saved and cleared" />
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
                  <span className="row-meta">{hostOf(h.url)} · {h.kind === 'saved' ? 'saved' : 'cleared'} {timeAgo(h.when)}{h.note ? ` · ${h.note}` : ''}</span>
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

          {segment === 'cleared' && (groups.length === 0 ? (
            <Empty title="Nothing cleared yet" body="Tabs tabDebt closes show up here for 30 days, with why each one went." />
          ) : (
            groups.map((g) => (
              <div key={g.runId} className="section">
                <div className="section-head">
                  <h2 className="section-label">{g.label}</h2>
                  <span className="section-hint">{g.kind === 'manual' ? 'Closed from the panel' : `${g.tabs.length} cleared`}</span>
                  <button className="text-btn" style={{ minHeight: 32, padding: '0 4px' }} aria-label={`Undo the clear from ${g.label}`} onClick={async () => { const n = await undo(g.runId); toast({ text: `${n} ${n === 1 ? 'tab' : 'tabs'} reopened`, ms: 4000 }); }}>Undo</button>
                </div>
                <ul>
                  {g.tabs.map((a) => (
                    <li key={a.recordId} className="item-row">
                      <Tile tab={{ url: a.url }} />
                      <span className="row-main">
                        <span className="row-title" title={a.title}>{a.title || hostOf(a.url)}</span>
                        <span className="row-meta">{clearedNote(a)}</span>
                      </span>
                      <button className="icon-btn" aria-label={`Reopen ${a.title}`} onClick={() => open(a.url)}><ReopenIcon size={18} /></button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ))}
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
