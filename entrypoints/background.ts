import { ChromeSessionStore, IdbTabStore } from '@/src/lib/db';
import { notifyChanged } from '@/src/lib/channel';
import { REMINDER_HOUR, REMINDER_MIN_TABS, REMINDER_MINUTE, badgeText, msUntilNext } from '@/src/lib/badge';
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

  // The badge shows the open tab count. After the end-of-day reminder it turns amber until a review is applied.
  const updateBadge = async () => {
    const count = (await store.listOpen()).length;
    const { reminding } = await chrome.storage.session.get('reminding');
    await chrome.action.setBadgeText({ text: badgeText(count) });
    await chrome.action.setBadgeBackgroundColor({ color: reminding ? '#b45309' : '#3f4fd9' });
    await chrome.action.setTitle({ title: reminding ? `Time to review: ${count} tabs open` : 'Open Tab Debt' });
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

  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.idle.setDetectionInterval(60);

  const sync = async () => {
    const tabs = (await chrome.tabs.query({})).map(toInfo).filter((t): t is TabInfo => !!t);
    await tracker.reconcile(tabs);
    const current = await activeTabInFocusedWindow();
    if (current) await tracker.resume(current);
  };

  // A quiet nudge near the end of the day: the badge turns amber and the tooltip says so.
  // Chrome only lets the side panel open from a click, so the extension never opens it by itself.
  const scheduleReminder = () =>
    chrome.alarms.create('end-of-day', { when: Date.now() + msUntilNext(REMINDER_HOUR, REMINDER_MINUTE), periodInMinutes: 24 * 60 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'end-of-day') return;
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

  chrome.tabs.onRemoved.addListener((tabId) => run('tab removed', () => tracker.removed(tabId)));

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
    });
  });
});
