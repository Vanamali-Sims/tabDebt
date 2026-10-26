import { useMemo, useState } from 'react';
import { Autocomplete } from '../Autocomplete';
import { BookmarkIcon, CheckIcon, ClockIcon, CloseIcon, LeafIcon } from '../Icons';
import { Tile } from '../Tile';
import { notifyChanged } from '@/src/lib/channel';
import { GROUP_MIN, SNOOZE_MS, summarize, tagOf, type Bucket } from '@/src/lib/debt';
import { formatDuration, hostOf, timeAgo } from '@/src/lib/format';
import { groupByHost } from '@/src/lib/group';
import { addSnooze, cancelSnooze } from '@/src/lib/snooze';
import { changeSinceYesterday, loadSnapshots } from '@/src/lib/snapshots';
import { activeRecordId, applyApprovedPlan, repos, undo } from '@/src/lib/services';
import { buildVocabulary } from '@/src/lib/suggest';
import { useLive } from '@/src/lib/useAsync';
import { useOpenTabs } from '@/src/lib/useTabs';
import type { PlanEntry, SavedItem, TabRecord } from '@/src/lib/types';

const SECTIONS: { bucket: Bucket; label: string; hint?: string; closeAll: boolean }[] = [
  { bucket: 'active', label: 'Active', closeAll: false },
  { bucket: 'idle', label: 'Idle', hint: '1h+', closeAll: true },
  { bucket: 'forgotten', label: 'Forgotten', closeAll: true },
];

interface Notice { text: string; undo?: () => Promise<void> }

async function goTo(tab: TabRecord) {
  if (tab.tabId == null) return;
  const t = await chrome.tabs.get(tab.tabId).catch(() => undefined);
  if (!t) return;
  await chrome.tabs.update(tab.tabId, { active: true });
  await chrome.windows.update(t.windowId, { focused: true });
}

/** Closing goes through the executor so it is recorded and can be undone, like a review. */
const toPlan = (tabs: TabRecord[]): PlanEntry[] =>
  tabs.map((t) => ({ recordId: t.id, action: 'done', reason: 'You closed it', confidence: 1, source: 'user', approved: true }));

function TabRow({ tab, current, tagged, indent, onClose, onSave, onSnooze, saved }: {
  tab: TabRecord; current?: boolean; tagged: boolean; indent?: boolean; saved?: boolean;
  onClose: (t: TabRecord) => void; onSave: (t: TabRecord) => void; onSnooze: (t: TabRecord) => void;
}) {
  const tag = tagged ? tagOf(tab) : null;
  return (
    <li className={`trow${current ? ' current' : ''}${indent ? ' indent' : ''}`}>
      <button className="trow-main" onClick={() => void goTo(tab)} title={tab.title}>
        <Tile tab={tab} />
        <span className="trow-text">
          <span className="trow-title">{tab.title || hostOf(tab.url)}</span>
          <span className="trow-meta">
            {hostOf(tab.url)} · {current ? 'this tab' : timeAgo(tab.lastActiveAt)}
            {tag && <> · <span className="tag-note">{tag}</span></>}
          </span>
        </span>
      </button>
      {!current && (
        <span className="trow-actions">
          <button className="act" aria-label={`Save ${tab.title}`} title={saved ? 'Saved' : 'Save for later'} onClick={() => onSave(tab)}>
            {saved ? <CheckIcon /> : <BookmarkIcon />}
          </button>
          <button className="act" aria-label={`Snooze ${tab.title} for 3 hours`} title="Snooze 3 hours" onClick={() => onSnooze(tab)}><ClockIcon /></button>
          <button className="act" aria-label={`Close ${tab.title}`} title="Close" onClick={() => onClose(tab)}><CloseIcon /></button>
        </span>
      )}
    </li>
  );
}

export function TabsView({ onReview, searching }: { onReview: () => void; searching: boolean }) {
  const tabs = useOpenTabs();
  const currentId = useLive(() => activeRecordId());
  const snaps = useLive(() => loadSnapshots());
  const lastRun = useLive(() => repos.runs.latest());
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());

  const now = Date.now();
  const q = filter.trim().toLowerCase();
  const visible = useMemo(
    () => (tabs ?? []).filter((t) => !searching || !q || `${t.title} ${hostOf(t.url)}`.toLowerCase().includes(q)),
    [tabs, searching, q],
  );
  const vocabulary = useMemo(() => buildVocabulary((tabs ?? []).flatMap((t) => [t.title, hostOf(t.url)])), [tabs]);
  const s = useMemo(() => summarize(visible, currentId ?? undefined, now), [visible, currentId, now]);
  const all = useMemo(() => summarize(tabs ?? [], currentId ?? undefined, now), [tabs, currentId, now]);
  const delta = tabs && snaps ? changeSinceYesterday(snaps, tabs.length) : null;
  const recentRun = lastRun && !lastRun.undoneAt && now - lastRun.at < 24 * 3_600_000 ? lastRun : null;

  const close = async (list: TabRecord[]) => {
    if (list.length === 0) return;
    const { skipped } = await applyApprovedPlan(toPlan(list));
    setNotice(skipped.length ? { text: `${skipped.length} left open (pinned, playing, or already closed).` } : null);
  };
  const save = async (t: TabRecord) => {
    const item: SavedItem = { id: crypto.randomUUID(), kind: 'read', title: t.title || hostOf(t.url), url: t.url, done: false, createdAt: Date.now(), runId: 'manual' };
    await repos.items.put(item);
    setSavedIds((ids) => new Set(ids).add(t.id));
    notifyChanged();
  };
  const snooze = async (t: TabRecord) => {
    if (t.tabId == null || t.pinned || t.audible) return;
    const entry = await addSnooze({ url: t.url, title: t.title }, SNOOZE_MS);
    await chrome.tabs.remove(t.tabId).catch(() => {});
    const when = new Date(entry.wakeAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setNotice({
      text: `Snoozed “${t.title.slice(0, 40)}” until ${when}.`,
      undo: async () => { await cancelSnooze(entry.id); await chrome.tabs.create({ url: t.url, active: false }); setNotice(null); },
    });
    notifyChanged();
  };

  const renderList = (list: TabRecord[], bucket: Bucket) => {
    const tagged = bucket !== 'active';
    const row = (t: TabRecord, indent?: boolean) => (
      <TabRow key={t.id} tab={t} tagged={tagged} indent={indent} saved={savedIds.has(t.id)} onClose={(x) => void close([x])} onSave={(x) => void save(x)} onSnooze={(x) => void snooze(x)} />
    );
    return groupByHost(list).flatMap((g) => {
      if (g.tabs.length < GROUP_MIN) return g.tabs.map((t) => row(t));
      const key = `${bucket}:${g.host}`;
      const isOpen = open.has(key);
      return [
        <li key={key} className="trow group-row">
          <button className="trow-main" aria-expanded={isOpen} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; })}>
            <Tile tab={g.tabs[0]!} />
            <span className="trow-text">
              <span className="trow-title">{g.tabs.length} tabs · {g.host}</span>
              <span className="trow-meta">{timeAgo(g.lastActiveAt)} · viewed {formatDuration(g.activeMs)}</span>
            </span>
            <span className={isOpen ? 'caret open' : 'caret'} aria-hidden="true" />
          </button>
        </li>,
        ...(isOpen ? g.tabs.map((t) => row(t, true)) : []),
      ];
    });
  };

  const counts = { active: all.active.length, idle: all.idle.length, forgotten: all.forgotten.length };
  const caughtUp = tabs !== null && tabs.length > 0 && counts.idle === 0 && counts.forgotten === 0;

  return (
    <section className="debt">
      <div className="summary">
        <div>
          <div className="big-row">
            <span className="big">{tabs === null ? '–' : all.debt}</span>
            {delta !== null && delta !== 0 && <span className={delta < 0 ? 'delta down' : 'delta up'}>{delta < 0 ? '↓' : '↑'} {Math.abs(delta)} from yesterday</span>}
          </div>
          <p className="sub">
            open {all.debt === 1 ? 'tab' : 'tabs'}
            {all.overAnHour > 0 && <> · <span className="idle-text">{all.overAnHour} idle over an hour</span></>}
          </p>
        </div>
        <button className="pill" onClick={onReview} disabled={!tabs || tabs.length === 0}>Review tabs</button>
      </div>

      {all.debt > 0 && (
        <div className="health">
          <div className="bar" role="img" aria-label={`${counts.active} active, ${counts.idle} idle, ${counts.forgotten} forgotten`}>
            {counts.active > 0 && <span className="seg seg-active" style={{ flexGrow: counts.active }} />}
            {counts.idle > 0 && <span className="seg seg-idle" style={{ flexGrow: counts.idle }} />}
            {counts.forgotten > 0 && <span className="seg seg-forgotten" style={{ flexGrow: counts.forgotten }} />}
          </div>
          <div className="bar-labels"><span>{counts.active} active</span><span>{counts.idle} idle</span><span>{counts.forgotten} forgotten</span></div>
        </div>
      )}

      {searching && (
        <div className="filter">
          <Autocomplete label="Filter open tabs" value={filter} onChange={setFilter} vocabulary={vocabulary} placeholder="Filter open tabs" />
        </div>
      )}

      {(notice || recentRun) && (
        <p className="banner" role="status">
          {notice ? notice.text : `Closed ${recentRun!.applied.length} ${recentRun!.applied.length === 1 ? 'tab' : 'tabs'}, ${timeAgo(recentRun!.at)}.`}{' '}
          {notice?.undo ? (
            <button className="link" onClick={() => void notice.undo!()}>Undo</button>
          ) : recentRun ? (
            <button className="link" onClick={async () => { await undo(recentRun.id); setNotice(null); }}>Undo</button>
          ) : null}
        </p>
      )}

      {tabs && tabs.length === 0 ? (
        <div className="empty">
          <h2>Nothing open yet</h2>
          <p>Browse as usual. Tabs show up here with how long it's been since you used each one.</p>
        </div>
      ) : (
        SECTIONS.map(({ bucket, label, hint, closeAll }) => {
          const list = s[bucket];
          const showCurrent = bucket === 'active' && s.current;
          if (list.length === 0 && !showCurrent) return null;
          return (
            <div key={bucket} className="section">
              <div className="section-head">
                <span className={`dot dot-${bucket}`} aria-hidden="true" />
                <h2 className="section-label">{label}{hint && <span className="section-hint"> {hint}</span>}</h2>
                {closeAll && <button className="link-quiet" onClick={() => void close(list)}>close all</button>}
              </div>
              <ul className="tlist">
                {showCurrent && <TabRow tab={s.current!} current tagged={false} onClose={() => {}} onSave={() => {}} onSnooze={() => {}} />}
                {renderList(list, bucket)}
              </ul>
            </div>
          );
        })
      )}

      {caughtUp && (
        <div className="caught-up">
          <LeafIcon size={22} />
          <p>All caught up</p>
        </div>
      )}
    </section>
  );
}
