import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { LeafIcon, SavedIcon, SearchIcon, SettingsIcon, TabsIcon } from './Icons';
import { Toast, type ToastSpec } from './Toast';
import { MorningView } from './views/MorningView';
import { ReviewView } from './views/ReviewView';
import { SavedView, type SavedSegment } from './views/SavedView';
import { SettingsView } from './views/SettingsView';
import { TabsView } from './views/TabsView';
import { loadBrief, shouldShowMorning } from '@/src/lib/brief';
import { undo } from '@/src/lib/services';
import { loadSettings } from '@/src/lib/settings';
import type { ApplyResult } from '@/src/lib/executor';

type View = 'tabs' | 'saved' | 'settings' | 'review' | 'morning';
const NAV: { id: Exclude<View, 'review' | 'morning'>; label: string; icon: ReactNode }[] = [
  { id: 'tabs', label: 'Tabs', icon: <TabsIcon size={22} /> },
  { id: 'saved', label: 'Saved', icon: <SavedIcon size={22} /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon size={22} /> },
];

/** "Closed 14 · Saved 6", the same words the review button used. */
export function appliedSummary(result: ApplyResult): string {
  const closed = result.run.applied.length;
  const saved = result.run.applied.filter((a) => a.action !== 'done').length;
  return saved > 0 ? `Closed ${closed} · Saved ${saved}` : `Closed ${closed}`;
}

/** The morning view is the Tabs section's first screen of the day. */
const onNav = (view: View, id: View) => view === id || (view === 'morning' && id === 'tabs');

export function App() {
  const [view, setView] = useState<View>('tabs');
  const [searching, setSearching] = useState(false);
  const [savedSegment, setSavedSegment] = useState<SavedSegment>('tasks');
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  // First open of the day: start on "Here's where you left off".
  useEffect(() => {
    void (async () => {
      const [brief, settings] = await Promise.all([loadBrief(), loadSettings()]);
      if (shouldShowMorning(brief, new Date(), settings.morningView)) setView((v) => (v === 'tabs' ? 'morning' : v));
    })();
  }, []);

  const openSaved = (seg: SavedSegment) => {
    setSavedSegment(seg);
    setView('saved');
  };

  const reviewed = (result: ApplyResult) => {
    setView('tabs');
    if (result.run.applied.length === 0) return;
    setToast({
      text: appliedSummary(result),
      action: { label: 'Undo', run: async () => { await undo(result.run.id); setToast({ text: `${result.run.applied.length} tabs reopened`, ms: 4000 }); } },
    });
  };

  return (
    <div className="shell">
      {view !== 'review' && (
        <header className="header">
          <h1 className="logo">
            <LeafIcon size={20} /> {view === 'saved' ? 'Saved' : view === 'settings' ? 'Settings' : view === 'morning' ? 'Good morning' : 'Tab Debt'}
          </h1>
          {view === 'tabs' && (
            <button className="icon-btn" aria-label="Search open tabs" aria-pressed={searching} onClick={() => setSearching((s) => !s)}>
              <SearchIcon size={22} />
            </button>
          )}
        </header>
      )}
      <main className="main">
        {view === 'tabs' && <TabsView onReview={() => setView('review')} searching={searching} onOpenSaved={openSaved} toast={setToast} />}
        {view === 'saved' && <SavedView segment={savedSegment} onSegment={setSavedSegment} toast={setToast} />}
        {view === 'settings' && <SettingsView />}
        {view === 'morning' && <MorningView onDone={() => setView('tabs')} onReview={() => setView('review')} onOpenSaved={openSaved} />}
        {view === 'review' && <ReviewView onClose={() => setView('tabs')} onApplied={reviewed} />}
      </main>
      {toast && <Toast toast={toast} onDone={clearToast} />}
      {view !== 'review' && (
        <nav className="nav" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} className={onNav(view, n.id) ? 'nav-item active' : 'nav-item'} aria-current={onNav(view, n.id) ? 'page' : undefined} onClick={() => setView(n.id)}>
              {n.icon}
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
