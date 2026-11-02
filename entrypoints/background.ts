import { ChromeSessionStore, IdbTabStore, idbRepos } from '@/src/lib/db';
import { notifyChanged } from '@/src/lib/channel';
import { badgeState } from '@/src/lib/badge';
import { briefOnLeave, isEvening, loadBrief, saveBrief, shouldShowMorning } from '@/src/lib/brief';
import { IDLE_AFTER_MS } from '@/src/lib/debt';
import {
  PROMPT_SCORE, RETRY_MS, afterPrompt, afterSkip, canPrompt, effectiveFinish, loadLastActive, loadLog, pruneSignals,
  recordActivity, saveLog, switchSignal, wrapUpScore, type Signal, type SignalKind,
} from '@/src/lib/nudge';
import { notePageOpened } from '@/src/lib/homebase';
import { prune } from '@/src/lib/retention';
import { loadSettings, saveSettings } from '@/src/lib/settings';
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

const WRAP_NOTIFICATION = 'wrapup';
const RETRY_ALARM = 'wrapup-retry';
const WEEK = 7 * 24 * 3_600_000;

export default defineBackground(() => {
  const store = new IdbTabStore();
  const tracker = new Tracker(store, new ChromeSessionStore());

  // ---- Badge: green dot in the morning, nothing when caught up, grey count, amber past the limit ----
  const updateBadge = async () => {
    const open = await store.listOpen();
    await recordSnapshot(open.length);
    const settings = await loadSettings();
    const now = Date.now();
    const b = badgeState({
      count: open.length,
      staleCount: open.filter((t) => now - t.lastActiveAt >= IDLE_AFTER_MS).length,
      tabLimit: settings.tabLimit,
      morning: shouldShowMorning(await loadBrief(), new Date(now), settings.morningView),
    });
    await chrome.action.setBadgeText({ text: b.text });
    await chrome.action.setBadgeBackgroundColor({ color: b.color });
    await chrome.action.setTitle({ title: `Tab Debt: ${b.title}` });
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

  // ---- Open side panels, so a prompt can be a banner there instead of a notification ----
  let panels = 0;
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'panel') return;
    panels++;
    port.onDisconnect.addListener(() => { panels = Math.max(0, panels - 1); });
  });

  // ---- Leaving: write tomorrow's brief, close nothing ----
  const finishTime = async (now: Date) => effectiveFinish((await loadSettings()).finishMinutes, await loadLastActive(), now);
  const leave = async () => {
    const now = new Date();
    if (!isEvening(now, await finishTime(now))) return;
    const { leftAt } = await chrome.storage.session.get('leftAt');
    if (typeof leftAt === 'number' && now.getTime() - leftAt < 60_000) return; // one window closing fires per tab
    await chrome.storage.session.set({ leftAt: now.getTime() });
    await saveBrief(briefOnLeave(await loadBrief(), await store.listOpen(), now));
  };

  // ---- Wrap-up signals and the one prompt a day ----
  const addSignal = async (kind: SignalKind) => {
    const { signals } = await chrome.storage.session.get('signals');
    const now = Date.now();
    await chrome.storage.session.set({ signals: pruneSignals([...((signals as Signal[] | undefined) ?? []), { t: now, kind }], now) });
  };

  /** Don't interrupt a video, a call or a presentation. */
  const busy = async () => {
    const win = await chrome.windows.getLastFocused().catch(() => undefined);
    if (win?.state === 'fullscreen') return true;
    return (await chrome.tabs.query({ audible: true })).length > 0;
  };

  const evaluate = async (retry = false) => {
    const settings = await loadSettings();
    const now = new Date();
    const open = await store.listOpen();
    const log = await loadLog();
    const ok = canPrompt({
      now, enabled: settings.wrapUpPrompt, frequency: settings.frequency, pausedUntil: settings.pausedUntil,
      finish: await finishTime(now), log, openCount: open.length, tabLimit: settings.tabLimit, retry,
    });
    if (ok !== true) return;
    if (!retry) {
      const { signals } = await chrome.storage.session.get('signals');
      if (wrapUpScore((signals as Signal[] | undefined) ?? [], now.getTime()) < PROMPT_SCORE) return;
    }
    if (await busy()) return;
    await saveLog(afterPrompt(log, now, retry));
    if (panels > 0) {
      await chrome.storage.session.set({ wrapUpAsk: { at: now.getTime(), count: open.length } });
    } else {
      await chrome.notifications.create(WRAP_NOTIFICATION, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('/icon/128.png'),
        title: 'Finishing up?',
        message: `${open.length} tabs open. Wrapping up takes about a minute.`,
        buttons: [{ title: 'Wrap up' }, { title: 'Not yet' }],
        priority: 0,
      });
    }
  };

  /** Open the panel straight into a review. If the browser won't open it from here, the next click will. */
  const openPanelTo = async (view: 'review' | 'settings', windowId?: number) => {
    await chrome.storage.session.set({ openView: view, wrapUpAsk: null });
    await chrome.notifications.clear(WRAP_NOTIFICATION).catch(() => {});
    const id = windowId ?? (await chrome.windows.getLastFocused().catch(() => undefined))?.id;
    if (id !== undefined) await chrome.sidePanel.open({ windowId: id }).catch(() => {});
  };

  const notYet = async () => {
    await chrome.storage.session.set({ wrapUpAsk: null });
    await chrome.notifications.clear(WRAP_NOTIFICATION).catch(() => {});
    const log = await loadLog();
    if (log.retried) await saveLog(afterSkip(log, new Date()));
    else await chrome.alarms.create(RETRY_ALARM, { when: Date.now() + RETRY_MS });
  };

  chrome.notifications.onButtonClicked.addListener((id, button) => {
    if (id !== WRAP_NOTIFICATION) return;
    if (button === 0) void openPanelTo('review');
    else run('not yet', notYet);
  });
  chrome.notifications.onClicked.addListener((id) => { if (id === WRAP_NOTIFICATION) void openPanelTo('review'); });

  chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
    if (msg?.type === 'wrapup:notyet') run('not yet', notYet);
  });

  // ---- Right-click the icon: silence it without opening anything ----
  const MENU = { review: 'review-now', skip: 'skip-tonight', pause: 'pause-week', settings: 'nudge-settings' } as const;
  const createMenus = () => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: MENU.review, title: 'Review tabs now', contexts: ['action'] });
      chrome.contextMenus.create({ id: MENU.skip, title: "Skip tonight's reminder", contexts: ['action'] });
      chrome.contextMenus.create({ id: MENU.pause, title: 'Pause reminders for a week', contexts: ['action'] });
      chrome.contextMenus.create({ id: MENU.settings, title: 'Reminder settings', contexts: ['action'] });
    });
  };
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU.review) void openPanelTo('review', tab?.windowId);
    if (info.menuItemId === MENU.settings) void openPanelTo('settings', tab?.windowId);
    if (info.menuItemId === MENU.skip) run('skip tonight', async () => {
      await saveLog(afterSkip(await loadLog(), new Date()));
      await chrome.storage.session.set({ wrapUpAsk: null });
    });
    if (info.menuItemId === MENU.pause) run('pause a week', async () => void (await saveSettings({ pausedUntil: Date.now() + WEEK })));
  });

  // ---- Lifecycle ----
  // The panel writes and dismisses the brief and changes settings, so the badge follows them.
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

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (isSnoozeAlarm(alarm.name)) {
      run('wake snoozed tab', () => wakeSnoozed(snoozeIdOf(alarm.name)));
      return;
    }
    if (alarm.name === RETRY_ALARM) run('wrap-up retry', () => evaluate(true));
  });
  // The fixed 5:30 pm reminder is replaced by the finish window.
  void chrome.alarms.clear('end-of-day');

  chrome.runtime.onStartup.addListener(() => run('startup sync', sync));
  chrome.runtime.onInstalled.addListener(() => {
    createMenus();
    forgetOld();
    run('install sync', sync);
  });

  chrome.tabs.onCreated.addListener((tab) => {
    const info = toInfo(tab);
    if (info) run('tab created', async () => void (await tracker.upsert(info)));
  });

  chrome.tabs.onUpdated.addListener((_id, change, tab) => {
    if (!change.url && !change.title && change.audible === undefined && change.pinned === undefined) return;
    const info = toInfo(tab);
    if (info) run('tab updated', async () => {
      await tracker.upsert(info);
      // Navigating within the tab you're on counts as opening that page too.
      if (change.url && tab.active) await notePageOpened(info.url);
    });
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    run('tab activated', async () => {
      const info = toInfo(await chrome.tabs.get(tabId));
      if (!info) return;
      await tracker.activated(info);
      await recordActivity();
      await notePageOpened(info.url);
      const { prevUrl } = await chrome.storage.session.get('prevUrl');
      await chrome.storage.session.set({ prevUrl: info.url });
      const signal = switchSignal(prevUrl as string | undefined, info.url);
      if (signal) {
        await addSignal(signal);
        await evaluate();
      }
    });
  });

  chrome.tabs.onRemoved.addListener((tabId, info) =>
    run('tab removed', async () => {
      // Closing the last window: take the brief before the tabs are marked closed.
      if (info.isWindowClosing) {
        if ((await chrome.windows.getAll()).length <= 1) await leave();
        await tracker.removed(tabId);
        return;
      }
      // A tab the person closed themselves (a review marks its tabs closed before removing them).
      const closedByUser = !!(await store.getOpenByTabId(tabId));
      await tracker.removed(tabId);
      if (closedByUser) {
        await addSignal('close');
        await evaluate();
      }
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
      if (state === 'active') {
        await tracker.resume(await activeTabInFocusedWindow());
        await recordActivity();
      } else await tracker.pause();
      if (state === 'locked') await leave();
    });
  });
});
