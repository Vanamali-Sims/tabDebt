import { useOpenTabs } from '@/src/lib/useTabs';
import { formatDuration, hostOf, timeAgo } from '@/src/lib/format';
import type { TabRecord } from '@/src/lib/types';

function Favicon({ tab }: { tab: TabRecord }) {
  const letter = (hostOf(tab.url).charAt(0) || '?').toUpperCase();
  return tab.favIconUrl?.startsWith('http') ? (
    <img className="favicon" src={tab.favIconUrl} alt="" width={20} height={20} />
  ) : (
    <span className="favicon letter" aria-hidden="true">
      {letter}
    </span>
  );
}

function TabRow({ tab }: { tab: TabRecord }) {
  const stale = Date.now() - tab.lastActiveAt > 2 * 24 * 3_600_000;
  return (
    <li className="row">
      <Favicon tab={tab} />
      <div className="row-main">
        <div className="row-title" title={tab.title}>
          {tab.title}
        </div>
        <div className="row-meta">
          {hostOf(tab.url)} · viewed {formatDuration(tab.activeMs)} · {tab.visits} {tab.visits === 1 ? 'visit' : 'visits'}
        </div>
      </div>
      <span className={stale ? 'when stale' : 'when'}>{timeAgo(tab.lastActiveAt)}</span>
    </li>
  );
}

export function App() {
  const tabs = useOpenTabs();

  return (
    <main className="panel">
      <header className="header">
        <h1>Tab Debt</h1>
        <p className="count">{tabs === null ? 'Loading…' : `${tabs.length} open ${tabs.length === 1 ? 'tab' : 'tabs'}`}</p>
      </header>
      {tabs && tabs.length === 0 ? (
        <section className="empty">
          <h2>Nothing open yet</h2>
          <p>Browse as usual. Tabs show up here with how long you've spent on each.</p>
        </section>
      ) : (
        <ul className="list">{tabs?.map((t) => <TabRow key={t.id} tab={t} />)}</ul>
      )}
    </main>
  );
}
