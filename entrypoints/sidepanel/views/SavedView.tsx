import { useMemo, useState } from 'react';
import { Autocomplete } from '../Autocomplete';
import { notifyChanged } from '@/src/lib/channel';
import { hostOf, timeAgo } from '@/src/lib/format';
import { searchClosed } from '@/src/lib/search';
import { buildVocabulary } from '@/src/lib/suggest';
import { repos } from '@/src/lib/services';
import { useLive } from '@/src/lib/useAsync';
import type { SavedItem } from '@/src/lib/types';

const open = (url: string) => void chrome.tabs.create({ url });

export function SavedView() {
  const [query, setQuery] = useState('');
  const items = useLive(() => repos.items.list());
  const closed = useLive(() => repos.tabs.listClosed());

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
  const byKind = (k: SavedItem['kind']) => (items ?? []).filter((i) => i.kind === k).sort((a, b) => b.createdAt - a.createdAt);
  const tasks = byKind('task');
  const reads = byKind('read');
  const projects = new Map<string, SavedItem[]>();
  for (const i of byKind('project')) projects.set(i.project ?? 'Other', [...(projects.get(i.project ?? 'Other') ?? []), i]);
  const empty = items !== null && items.length === 0;

  return (
    <section className="panel-body">
      <div className="search">
        <Autocomplete label="Search closed tabs and saved items" value={query} onChange={setQuery} vocabulary={vocabulary} placeholder="That caching article from last week" />
      </div>

      {q ? (
        hits.length === 0 ? (
          <p className="muted center-text">Nothing found for "{q}".</p>
        ) : (
          <ul className="list">
            {hits.map((h) => (
              <li key={h.url + h.when} className="row">
                <div className="row-main">
                  <div className="row-title" title={h.title}>{h.title}</div>
                  <div className="row-meta">{hostOf(h.url)} · {h.kind === 'saved' ? 'saved' : 'closed'} {timeAgo(h.when)}{h.note ? ` · ${h.note}` : ''}</div>
                </div>
                <button className="link" onClick={() => open(h.url)}>Reopen</button>
              </li>
            ))}
          </ul>
        )
      ) : empty ? (
        <div className="empty">
          <h2>Nothing saved yet</h2>
          <p>After a review, tasks, reading and project tabs end up here.</p>
        </div>
      ) : (
        <>
          {tasks.length > 0 && (
            <Section title="Tasks" count={tasks.filter((t) => !t.done).length}>
              {tasks.map((t) => (
                <li key={t.id} className="row">
                  <label className="plan-label">
                    <input type="checkbox" checked={t.done} onChange={() => patch(t, { done: !t.done })} />
                    <span className="row-main">
                      <span className={t.done ? 'row-title done' : 'row-title'}>{t.title}</span>
                      <span className="row-meta">{t.due ? `Due ${t.due} · ` : ''}{hostOf(t.url)}</span>
                    </span>
                  </label>
                  <button className="link" onClick={() => open(t.url)}>Open</button>
                  <button className="link" onClick={() => remove(t)} aria-label={`Remove ${t.title}`}>Remove</button>
                </li>
              ))}
            </Section>
          )}
          {reads.length > 0 && (
            <Section title="To read" count={reads.length}>
              {reads.map((r) => <ItemRow key={r.id} item={r} onRemove={() => remove(r)} />)}
            </Section>
          )}
          {[...projects].map(([name, list]) => (
            <Section key={name} title={name} count={list.length}>
              {list.map((p) => <ItemRow key={p.id} item={p} onRemove={() => remove(p)} />)}
            </Section>
          ))}
        </>
      )}
    </section>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="group">
      <div className="group-head"><span className="chip">{count}</span><h3>{title}</h3></div>
      <ul className="plan-list">{children}</ul>
    </section>
  );
}

function ItemRow({ item, onRemove }: { item: SavedItem; onRemove: () => void }) {
  return (
    <li className="row">
      <div className="row-main">
        <div className="row-title" title={item.title}>{item.title}</div>
        <div className="row-meta">{item.summary ?? hostOf(item.url)}</div>
      </div>
      <button className="link" onClick={() => open(item.url)}>Open</button>
      <button className="link" onClick={onRemove} aria-label={`Remove ${item.title}`}>Remove</button>
    </li>
  );
}
