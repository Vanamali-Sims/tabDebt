import { SNOOZE_MS } from './debt';

export interface SnoozeEntry {
  id: string;
  url: string;
  title: string;
  wakeAt: number;
}

const ALARM = 'snooze:';
export const isSnoozeAlarm = (name: string) => name.startsWith(ALARM);
export const snoozeIdOf = (name: string) => name.slice(ALARM.length);

/** Entries whose time has come. Pure, so it can be tested without a browser. */
export const pickDue = (entries: SnoozeEntry[], now: number) => entries.filter((e) => e.wakeAt <= now);

async function load(): Promise<SnoozeEntry[]> {
  const { snoozed } = await chrome.storage.local.get('snoozed');
  return (snoozed as SnoozeEntry[] | undefined) ?? [];
}
const save = (entries: SnoozeEntry[]) => chrome.storage.local.set({ snoozed: entries });

/** Remember a tab to bring back later. The caller closes the tab. */
export async function addSnooze(tab: { url: string; title: string }, delayMs = SNOOZE_MS, now = Date.now()): Promise<SnoozeEntry> {
  const entry: SnoozeEntry = { id: crypto.randomUUID(), url: tab.url, title: tab.title, wakeAt: now + delayMs };
  await save([...(await load()), entry]);
  await chrome.alarms.create(ALARM + entry.id, { when: entry.wakeAt });
  return entry;
}

export async function cancelSnooze(id: string): Promise<void> {
  await save((await load()).filter((e) => e.id !== id));
  await chrome.alarms.clear(ALARM + id);
}

/** Reopen a snoozed tab in the background and forget the entry. */
export async function wakeSnoozed(id: string): Promise<void> {
  const entry = (await load()).find((e) => e.id === id);
  if (!entry) return;
  await save((await load()).filter((e) => e.id !== id));
  await chrome.tabs.create({ url: entry.url, active: false });
}

/** Alarms can be lost when the browser restarts, so recreate any that are missing or overdue. */
export async function restoreSnoozed(now = Date.now()): Promise<void> {
  for (const e of await load()) {
    if (!(await chrome.alarms.get(ALARM + e.id))) await chrome.alarms.create(ALARM + e.id, { when: Math.max(e.wakeAt, now + 1000) });
  }
}
