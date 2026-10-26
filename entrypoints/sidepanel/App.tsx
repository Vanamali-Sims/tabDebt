import { useState, type ReactNode } from 'react';
import { LeafIcon, SavedIcon, SearchIcon, SettingsIcon, TabsIcon } from './Icons';
import { ReviewView } from './views/ReviewView';
import { SavedView } from './views/SavedView';
import { SettingsView } from './views/SettingsView';
import { TabsView } from './views/TabsView';

type View = 'tabs' | 'saved' | 'settings' | 'review';
const NAV: { id: Exclude<View, 'review'>; label: string; icon: ReactNode }[] = [
  { id: 'tabs', label: 'Tabs', icon: <TabsIcon size={18} /> },
  { id: 'saved', label: 'Saved', icon: <SavedIcon size={18} /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
];

export function App() {
  const [view, setView] = useState<View>('tabs');
  const [searching, setSearching] = useState(false);

  return (
    <div className="shell">
      <header className="header">
        <h1 className="logo"><LeafIcon size={15} /> Tab Debt</h1>
        {view === 'tabs' && (
          <button className="icon-btn" aria-label="Search open tabs" aria-pressed={searching} onClick={() => setSearching((s) => !s)}>
            <SearchIcon size={18} />
          </button>
        )}
      </header>
      <main className="main">
        {view === 'tabs' && <TabsView onReview={() => setView('review')} searching={searching} />}
        {view === 'saved' && <SavedView />}
        {view === 'settings' && <SettingsView />}
        {view === 'review' && <ReviewView onClose={() => setView('tabs')} />}
      </main>
      {view !== 'review' && (
        <nav className="nav" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} className={view === n.id ? 'nav-item active' : 'nav-item'} aria-current={view === n.id ? 'page' : undefined} onClick={() => setView(n.id)}>
              {n.icon}
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
