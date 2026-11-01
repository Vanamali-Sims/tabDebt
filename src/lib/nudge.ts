import { dayKey } from './snapshots';
import { hostOf } from './format';

/**
 * When to ask "Finishing up?". The budget is one interruption a day at most: only inside the person's usual
 * finish window, only when they act like they're wrapping up, and less often if they keep saying no.
 * Everything here is pure so it can be tested without a browser.
 */

const MIN = 60_000;
/** The window opens this long before the usual finish time and closes this long after. */
export const WINDOW_BEFORE_MIN = 45;
export const WINDOW_AFTER_MIN = 90;
/** Weekdays seen before a learned finish time is offered. */
export const LEARN_MIN_DAYS = 5;
/** "Not yet" asks once more after this long. */
export const RETRY_MS = 30 * MIN;
/** Skipped evenings in a row before asking whether to remind less. */
export const BACKOFF_AFTER = 3;
/** Signals at or above this score mean "wrapping up". */
export const PROMPT_SCORE = 2;

export type Frequency = 'daily' | 'weekly' | 'badge';
export type SignalKind = 'close' | 'personal' | 'planner';
export interface Signal { t: number; kind: SignalKind }

export interface NudgeLog {
  /** Local day of the last prompt. */
  day: string;
  asked: number;
  retried: boolean;
  /** A review was applied that day. */
  reviewed: boolean;
  /** Turned off for the rest of the day from the menu or "Not yet" twice. */
  skipped: boolean;
  /** Evenings in a row that were prompted and not reviewed. */
  skipStreak: number;
}

export const emptyLog = (day = ''): NudgeLog => ({ day, asked: 0, retried: false, reviewed: false, skipped: false, skipStreak: 0 });

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const isWeekday = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5;

/** "5:45 pm" */
export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = String(m % 60).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}
export const toTimeInput = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const fromTimeInput = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * The usual finish time: the median of when browsing stopped on recent weekdays, rounded to 15 minutes.
 * Days that ended before noon don't look like a workday and are ignored. Null until there's a week of data.
 */
export function learnFinishTime(lastActive: Record<string, number>, now: Date): number | null {
  const today = dayKey(now);
  const samples = Object.entries(lastActive)
    .filter(([day, m]) => day < today && m >= 12 * 60 && isWeekday(new Date(`${day}T12:00:00`)))
    .map(([, m]) => m)
    .sort((a, b) => a - b);
  if (samples.length < LEARN_MIN_DAYS) return null;
  const mid = samples.length / 2;
  const median = samples.length % 2 ? samples[Math.floor(mid)]! : (samples[mid - 1]! + samples[mid]!) / 2;
  return Math.round(median / 15) * 15;
}

export function inWindow(now: Date, finish: number): boolean {
  const m = minutesOf(now);
  return m >= finish - WINDOW_BEFORE_MIN && m <= finish + WINDOW_AFTER_MIN;
}

// Sites by host (the host or any subdomain of it). Prefixes ending in '.' match any country domain.
const WORK = ['github.com', 'gitlab.com', 'bitbucket.org', 'atlassian.net', 'linear.app', 'notion.so', 'docs.google.com', 'sheets.google.com', 'slack.com', 'figma.com', 'stackoverflow.com', 'vercel.com', 'localhost', 'office.com', 'sharepoint.com', 'asana.com', 'monday.com', 'trello.com', 'miro.com', 'claude.ai', 'chatgpt.com'];
const PERSONAL = ['youtube.com', 'netflix.com', 'reddit.com', 'twitch.tv', 'instagram.com', 'facebook.com', 'tiktok.com', 'x.com', 'twitter.com', 'spotify.com', 'primevideo.com', 'disneyplus.com', 'stan.com.au', 'binge.com.au', 'hulu.com', 'max.com', 'store.steampowered.com', 'ebay.', 'amazon.'];
const PLANNER = ['calendar.google.com', 'tasks.google.com', 'todoist.com', 'ticktick.com', 'toggl.com', 'clockify.me', 'harvestapp.com'];
/** Planner pages that live on a general host, matched on the address. */
const PLANNER_PATHS = ['outlook.office.com/calendar', 'outlook.live.com/calendar', 'timesheet'];

const hostIn = (host: string, list: string[]) =>
  list.some((x) => (x.endsWith('.') ? host.startsWith(x) || host.includes(`.${x}`) : host === x || host.endsWith(`.${x}`)));

/** Rough kind of site, from the address only. */
export function siteKind(url: string): 'work' | 'personal' | 'planner' | null {
  if (!/^https?:/i.test(url)) return null;
  const host = hostOf(url.toLowerCase());
  if (hostIn(host, PLANNER) || PLANNER_PATHS.some((p) => url.toLowerCase().includes(p))) return 'planner';
  if (hostIn(host, PERSONAL)) return 'personal';
  if (hostIn(host, WORK)) return 'work';
  return null;
}

/** The signal, if any, from switching tabs: work to personal, or opening a calendar or to-do list. */
export function switchSignal(prevUrl: string | undefined, nextUrl: string): SignalKind | null {
  const next = siteKind(nextUrl);
  if (next === 'planner') return 'planner';
  if (next === 'personal' && prevUrl && siteKind(prevUrl) === 'work') return 'personal';
  return null;
}

/**
 * How much it looks like wrapping up. Closing several tabs in a burst is the strongest sign: they are
 * already tidying. A switch from work to personal sites, or checking tomorrow's plan, adds a point each.
 */
export function wrapUpScore(signals: Signal[], now: number): number {
  const since = (ms: number, kind: SignalKind) => signals.filter((s) => s.kind === kind && now - s.t <= ms).length;
  let score = 0;
  if (since(2 * MIN, 'close') >= 3) score += 2;
  if (since(10 * MIN, 'personal') > 0) score += 1;
  if (since(15 * MIN, 'planner') > 0) score += 1;
  return score;
}

/** Keeps the signal list short: nothing older than half an hour matters. */
export const pruneSignals = (signals: Signal[], now: number) => signals.filter((s) => now - s.t <= 30 * MIN).slice(-50);

export interface PromptCheck {
  now: Date;
  enabled: boolean;
  frequency: Frequency;
  pausedUntil: number;
  finish: number | null;
  log: NudgeLog;
  openCount: number;
  tabLimit: number;
  /** True for the single follow-up after "Not yet". */
  retry?: boolean;
}

/** Whether a "Finishing up?" prompt is allowed now. Returns the reason when it isn't, for debugging. */
export function canPrompt(c: PromptCheck): true | string {
  if (!c.enabled) return 'off';
  if (c.frequency === 'badge') return 'badge only';
  if (c.now.getTime() < c.pausedUntil) return 'paused';
  if (!isWeekday(c.now)) return 'weekend';
  if (c.frequency === 'weekly' && c.now.getDay() !== 5) return 'weekly: Fridays only';
  if (c.finish === null) return 'no finish time yet';
  if (!inWindow(c.now, c.finish)) return 'outside the window';
  if (c.openCount < c.tabLimit) return 'under the tab limit';
  const today = c.log.day === dayKey(c.now);
  if (today && (c.log.reviewed || c.log.skipped)) return 'done for today';
  if (c.log.skipStreak >= BACKOFF_AFTER) return 'waiting on the back-off question';
  if (today && c.log.asked > 0) {
    if (!c.retry || c.log.retried) return 'already asked today';
  }
  return true;
}

/** The log after a prompt is shown. A new day carries the streak forward from the last prompted day. */
export function afterPrompt(log: NudgeLog, now: Date, retry = false): NudgeLog {
  const today = dayKey(now);
  if (log.day === today) return { ...log, asked: log.asked + 1, retried: log.retried || retry };
  const missed = log.day !== '' && log.asked > 0 && !log.reviewed;
  return { ...emptyLog(today), asked: 1, skipStreak: missed ? log.skipStreak + 1 : 0 };
}

export function afterReview(log: NudgeLog, now: Date): NudgeLog {
  const today = dayKey(now);
  return { ...(log.day === today ? log : emptyLog(today)), reviewed: true, skipStreak: 0 };
}

export function afterSkip(log: NudgeLog, now: Date): NudgeLog {
  const today = dayKey(now);
  return { ...(log.day === today ? log : { ...emptyLog(today), skipStreak: log.skipStreak }), skipped: true };
}

/** The back-off question is due once the streak reaches the limit. */
export const backoffDue = (log: NudgeLog) => log.skipStreak >= BACKOFF_AFTER;

// ---- Storage ----

export async function loadLog(): Promise<NudgeLog> {
  const { nudgeLog } = await chrome.storage.local.get('nudgeLog');
  return { ...emptyLog(), ...(nudgeLog as Partial<NudgeLog> | undefined) };
}
export const saveLog = (log: NudgeLog) => chrome.storage.local.set({ nudgeLog: log });

export async function loadLastActive(): Promise<Record<string, number>> {
  const { lastActive } = await chrome.storage.local.get('lastActive');
  return (lastActive as Record<string, number> | undefined) ?? {};
}

/** Remember the latest minute of activity for today, keeping three weeks. */
export async function recordActivity(now: Date = new Date()): Promise<void> {
  const all = await loadLastActive();
  const day = dayKey(now);
  const m = minutesOf(now);
  if ((all[day] ?? -1) >= m) return;
  all[day] = m;
  const keep = Object.keys(all).sort().slice(-21);
  await chrome.storage.local.set({ lastActive: Object.fromEntries(keep.map((k) => [k, all[k]!])) });
}
