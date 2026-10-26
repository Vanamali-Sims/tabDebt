import { Leaves } from '../Leaves';
import { notifyChanged } from '@/src/lib/channel';
import { formatDuration, hostOf, timeAgo } from '@/src/lib/format';
import { groupByHost, type HostGroup } from '@/src/lib/group';
import { repos, undo } from '@/src/lib/services';
import { useLive } from '@/src/lib/useAsync';
import { useMemo } from 'react';
import { useOpenTabs } from '@/src/lib/useTabs';
import type { TabRecord } from '@/src/lib/types';

function Favicon({ tab }: { tab: TabRecord }) {
  const letter = (hostOf(tab.url).charAt(0) || '?').toUpperCase();
  return tab.favIconUrl?.startsWith('http') ? (
    <img className="favicon" src={tab.favIconUrl} alt="" width={20} height={20} />
  ) : (
    <span className="favicon letter" aria-hidden="true">{letter}</span>
  );
}

function TabRow({ tab }: { tab: TabRecord }) {
  const stale = Date.now() - tab.lastActiveAt > 2 * 24 * 3_600_000;
  return (
    <li className="row">
      <Favicon tab={tab} />
      <div className="row-main">
        <div className="row-title" title={tab.title}>{tab.title}</div>
        <div className="row-meta">
          {hostOf(tab.url)} · viewed {formatDuration(tab.activeMs)} · {tab.visits} {tab.visits === 1 ? 'visit' : 'visits'}
        </div>
      </div>
      <span className={stale ? 'when stale' : 'when'}>{timeAgo(tab.lastActiveAt)}</span>
    </li>
  );
}

function Strip({ tabs }: { tabs: TabRecord[] }) {
  const show = tabs.slice(0, 24);
  return (
    <div className="strip" role="list" aria-label="Open tabs at a glance">
      {show.map((t) => (
        <button
          key={t.id}
          role="listitem"
          className="strip-item"
          title={t.title}
          aria-label={`Go to ${t.title}`}
          onClick={() => { if (t.tabId != null) void chrome.tabs.update(t.tabId, { active: true }); }}
        >
          <Favicon tab={t} />
        </button>
      ))}
      {tabs.length > show.length && <span className="muted">+{tabs.length - show.length}</span>}
    </div>
  );
}

function GroupRow({ group }: { group: HostGroup }) {
  if (group.tabs.length === 1) return <TabRow tab={group.tabs[0]!} />;
  const stale = Date.now() - group.lastActiveAt > 2 * 24 * 3_600_000;
  return (
    <li className="host-group">
      <details>
        <summary className="row">
          <Favicon tab={group.tabs[0]!} />
          <div className="row-main">
            <div className="row-title">{group.host}</div>
            <div className="row-meta">{group.tabs.length} tabs · viewed {formatDuration(group.activeMs)}</div>
          </div>
          <span className={stale ? 'when stale' : 'when'}>{timeAgo(group.lastActiveAt)}</span>
          <span className="caret" aria-hidden="true" />
        </summary>
        <ul className="sub-list">
          {group.tabs.map((t) => (
            <li key={t.id} className="sub-row">
              <span className="row-title" title={t.title}>{t.title}</span>
              <span className="when">{timeAgo(t.lastActiveAt)}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

export function TabsView({ onReview }: { onReview: () => void }) {
  const tabs = useOpenTabs();
  const groups = useMemo(() => groupByHost(tabs ?? []), [tabs]);
  const lastRun = useLive(() => repos.runs.latest());
  const recentRun = lastRun && !lastRun.undoneAt && Date.now() - lastRun.at < 24 * 3_600_000 ? lastRun : null;

  return (
    <section className="panel-body">
      <div className="hero">
        <p className="count">{tabs === null ? 'Loading…' : `${tabs.length} open ${tabs.length === 1 ? 'tab' : 'tabs'}`}</p>
        <span className="leafy">
          <Leaves />
          <button className="btn btn-primary" onClick={onReview} disabled={!tabs || tabs.length === 0}>Review my tabs</button>
        </span>
      </div>

      {recentRun && (
        <p className="banner" role="status">
          Last review closed {recentRun.applied.length} {recentRun.applied.length === 1 ? 'tab' : 'tabs'}, {timeAgo(recentRun.at)}.{' '}
          <button className="link" onClick={async () => { await undo(recentRun.id); notifyChanged(); }}>Undo</button>
        </p>
      )}

      {tabs && tabs.length === 0 ? (
        <div className="empty">
          <h2>Nothing open yet</h2>
          <p>Browse as usual. Tabs show up here with how long you've spent on each.</p>
        </div>
      ) : (
        <>
          {tabs && tabs.length > 1 && <Strip tabs={tabs} />}
          <ul className="list">{groups.map((g) => <GroupRow key={g.host} group={g} />)}</ul>
        </>
      )}
    </section>
  );
}
