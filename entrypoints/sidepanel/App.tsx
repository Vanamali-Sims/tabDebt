import { useState } from 'react';
import { ReviewView } from './views/ReviewView';
import { SavedView } from './views/SavedView';
import { SettingsView } from './views/SettingsView';
import { TabsView } from './views/TabsView';

type View = 'tabs' | 'saved' | 'settings' | 'review';
const NAV: { id: Exclude<View, 'review'>; label: string }[] = [
  { id: 'tabs', label: 'Tabs' },
  { id: 'saved', label: 'Saved' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [view, setView] = useState<View>('tabs');

  return (
    <div className="shell">
      <header className="header">
        <h1>Tab Debt</h1>
      </header>
      <main className="main">
        {view === 'tabs' && <TabsView onReview={() => setView('review')} />}
        {view === 'saved' && <SavedView />}
        {view === 'settings' && <SettingsView />}
        {view === 'review' && <ReviewView onClose={() => setView('tabs')} />}
      </main>
      {view !== 'review' && (
        <nav className="nav" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} className={view === n.id ? 'nav-item active' : 'nav-item'} aria-current={view === n.id ? 'page' : undefined} onClick={() => setView(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
