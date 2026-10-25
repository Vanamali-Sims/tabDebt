import { ChromeSessionStore, IdbTabStore } from '@/src/lib/db';
import { notifyChanged } from '@/src/lib/channel';
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
  const tracker = new Tracker(new IdbTabStore(), new ChromeSessionStore());

  // Events can fire in bursts (switching tabs also changes window focus), so handlers
  // run one at a time in arrival order. A failure is logged and never blocks the queue.
  let queue: Promise<unknown> = Promise.resolve();
  const run = (label: string, fn: () => Promise<void>) => {
    queue = queue
      .then(fn)
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
