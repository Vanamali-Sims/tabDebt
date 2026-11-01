import { ChromeSessionStore, IdbTabStore } from '@/src/lib/db';
import { notifyChanged } from '@/src/lib/channel';
import { REMINDER_HOUR, REMINDER_MIN_TABS, REMINDER_MINUTE, badgeText, msUntilNext } from '@/src/lib/badge';
import { idbRepos } from '@/src/lib/db';
import { briefOnLeave, isEvening, loadBrief, saveBrief, shouldShowMorning } from '@/src/lib/brief';
import { prune } from '@/src/lib/retention';
import { loadSettings } from '@/src/lib/settings';
import { recordSnapshot } from '@/src/lib/snapshots';
import { isSnoozeAlarm, restoreSnoozed, snoozeIdOf, wakeSnoozed } from '@/src/lib/snooze';
import { Tracker } from '@/src/lib/tracker';
import type { TabInfo } from '@/src/lib/types';

const toInfo = (t: chrome.tabs.Tab): TabInfo | undefined =>
  t.id === undefined
    ? undefined
    : {
        id: t.id,
        url: t.url ?? t.pendingUrl ?? '',
        title: t.title ?? '',
        favIconUrl: t.favIconUrl,
        openerTabId: t.openerTabId,
        pinned: t.pinned,
        audible: t.audible,
      };

async function activeTabInFocusedWindow(): Promise<TabInfo | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ? toInfo(tab) : undefined;
}

export default defineBackground(() => {
  const store = new IdbTabStore();
  const tracker = new Tracker(store, new ChromeSessionStore());

  // The badge shows the open tab count. After the end-of-day reminder it turns rust until a review is applied.
  // When the morning view is waiting, it shows a green dot instead.
  const updateBadge = async () => {
    const count = (await store.listOpen()).length;
    await recordSnapshot(count);
    const settings = await loadSettings();
    if (shouldShowMorning(await loadBrief(), new Date(), settings.morningView)) {
      await chrome.action.setBadgeText({ text: '•' });
      await chrome.action.setBadgeBackgroundColor({ color: '#86b48e' });
      await chrome.action.setTitle({ title: "Here's where you left off" });
      return;
    }
    const { reminding } = await chrome.storage.session.get('reminding');
    await chrome.action.setBadgeText({ text: badgeText(count) });
    await chrome.action.setBadgeBackgroundColor({ color: reminding ? '#c4705a' : '#7fb08a' });
    await chrome.action.setTitle({ title: reminding ? `Time to review: ${count} tabs open` : 'Open Tab Debt' });
  };

  /**
   * Leaving in the evening (locking the screen or closing the last window) writes tomorrow's brief from
   * whatever is still open, so the morning view works even without a review. Closes nothing.
   */
  const leave = async () => {
    const now = new Date();
    if (!isEvening(now, null)) return;
    const { leftAt } = await chrome.storage.session.get('leftAt');
    if (typeof leftAt === 'number' && now.getTime() - leftAt < 60_000) return; // one window closing fires per tab
    await chrome.storage.session.set({ leftAt: now.getTime() });
    await saveBrief(briefOnLeave(await loadBrief(), await store.listOpen(), now));
  };

  // Events can fire in bursts (switching tabs also changes window focus), so handlers
  // run one at a time in arrival order. A failure is logged and never blocks the queue.
  let queue: Promise<unknown> = Promise.resolve();
  const run = (label: string, fn: () => Promise<void>) => {
    queue = queue
      .then(fn)
      .then(updateBadge)
      .then(notifyChanged)
      .catch((err) => console.error(`[tab-debt] ${label} failed`, err));
  };

  // The panel writes and dismisses the brief, so the dot follows it.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.brief || changes.settings)) void updateBadge().catch(() => {});
  });

  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.idle.setDetectionInterval(60);

  const forgetOld = () => void prune(idbRepos()).catch((err) => console.error('[tab-debt] prune failed', err));

  const sync = async () => {
    const tabs = (await chrome.tabs.query({})).map(toInfo).filter((t): t is TabInfo => !!t);
    forgetOld();
    await restoreSnoozed();
    await tracker.reconcile(tabs);
    const current = await activeTabInFocusedWindow();
    if (current) await tracker.resume(current);
  };

  // A quiet nudge near the end of the day: the badge turns amber and the tooltip says so.
  // Chrome only lets the side panel open from a click, so the extension never opens it by itself.
  const scheduleReminder = () =>
    chrome.alarms.create('end-of-day', { when: Date.now() + msUntilNext(REMINDER_HOUR, REMINDER_MINUTE), periodInMinutes: 24 * 60 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (isSnoozeAlarm(alarm.name)) {
      run('wake snoozed tab', () => wakeSnoozed(snoozeIdOf(alarm.name)));
      return;
    }
    if (alarm.name !== 'end-of-day') return;
    forgetOld(); // once a day is plenty
    run('end-of-day reminder', async () => {
      if ((await store.listOpen()).length >= REMINDER_MIN_TABS) await chrome.storage.session.set({ reminding: true });
    });
  });
  chrome.alarms.get('end-of-day').then((a) => { if (!a) scheduleReminder(); });

  chrome.runtime.onStartup.addListener(() => run('startup sync', sync));
  chrome.runtime.onInstalled.addListener(() => run('install sync', sync));

  chrome.tabs.onCreated.addListener((tab) => {
    const info = toInfo(tab);
    if (info) run('tab created', async () => void (await tracker.upsert(info)));
  });

  chrome.tabs.onUpdated.addListener((_id, change, tab) => {
    if (!change.url && !change.title && change.audible === undefined && change.pinned === undefined) return;
    const info = toInfo(tab);
    if (info) run('tab updated', async () => void (await tracker.upsert(info)));
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    run('tab activated', async () => {
      const info = toInfo(await chrome.tabs.get(tabId));
      if (info) await tracker.activated(info);
    });
  });

  chrome.tabs.onRemoved.addListener((tabId, info) =>
    run('tab removed', async () => {
      // Closing the last window: take the brief before the tabs are marked closed.
      if (info.isWindowClosing && (await chrome.windows.getAll()).length <= 1) await leave();
      await tracker.removed(tabId);
    }),
  );

  chrome.windows.onFocusChanged.addListener((windowId) => {
    run('window focus', async () => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) return tracker.pause();
      await tracker.resume(await activeTabInFocusedWindow());
    });
  });

  chrome.idle.onStateChanged.addListener((state) => {
    run('idle change', async () => {
      if (state === 'active') await tracker.resume(await activeTabInFocusedWindow());
      else await tracker.pause();
      if (state === 'locked') await leave();
    });
  });
});
