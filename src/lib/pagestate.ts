import type { TabRecord, Verdict } from './types';

/**
 * What tabDebt can learn from inside a page, when the person has allowed it. Only numbers and yes/no
 * leave the page: never the text someone typed, never the page content.
 */
export interface PageState {
  video?: { current: number; duration: number | null; ended: boolean };
  /** A visible text box or composer has something typed in it. */
  typing?: boolean;
}

export interface ProbeOptions {
  video: boolean;
  typing: boolean;
}

/**
 * Runs inside the page through chrome.scripting, so it must not use anything from outside its own body.
 * Exported so the end-to-end test can run the same function.
 */
export function probePage(opts: ProbeOptions): PageState {
  const out: { video?: { current: number; duration: number | null; ended: boolean }; typing?: boolean } = {};
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };

  if (opts.video) {
    // The biggest video on the page is the one being watched; previews and ads are small.
    const videos = Array.from(document.querySelectorAll('video')).filter((v) => v.readyState > 0 || v.currentTime > 0);
    videos.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    const v = videos[0];
    if (v) out.video = { current: v.currentTime, duration: Number.isFinite(v.duration) ? v.duration : null, ended: v.ended };
  }

  if (opts.typing) {
    // Search boxes hold the last query, so they never count.
    const searchy = (el: Element) =>
      el.getAttribute('role') === 'combobox' ||
      (el as HTMLInputElement).type === 'search' ||
      [el.getAttribute('name'), el.id, el.getAttribute('aria-label'), el.getAttribute('placeholder')].some((x) => !!x && /search|query|^q$/i.test(x.trim()));
    const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'textarea, input:not([type]), input[type=text], input[type=email], input[type=url]',
    ));
    const typedField = fields.some((f) => !f.disabled && !f.readOnly && !searchy(f) && visible(f) && f.value.trim() !== '' && f.value !== f.defaultValue);
    // Composers (chat boxes, comment boxes) are small editable areas. A whole editable document is not a draft.
    const maxHeight = window.innerHeight * 0.5;
    const editors = Array.from(document.querySelectorAll<HTMLElement>('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'));
    const typedEditor = editors.some((el) => {
      if (el === document.body || searchy(el) || !visible(el)) return false;
      if (el.parentElement?.closest('[contenteditable=""], [contenteditable="true"]')) return false; // only the outer editor
      return el.getBoundingClientRect().height <= maxHeight && (el.innerText ?? '').trim() !== '';
    });
    out.typing = typedField || typedEditor;
  }
  return out;
}

// ---- What video progress means ----

/** Watched this much (or more) counts as finished. */
export const WATCHED_FRACTION = 0.9;
/** Less than this into a video means it barely started: no opinion. */
const STARTED_S = 15;
const DAY = 24 * 3_600_000;
/** Videos meant to run in the background while you do something else. */
const BACKGROUND = /study with me|lo-?fi|ambien(ce|t)|white noise|rain sounds|focus music|music|playlist|\bmix\b|radio|asmr|sleep|pomodoro|livestream|\blive\b/i;

/** 12:40, or 1:02:05 for long videos. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** The address that resumes where you stopped, for sites that support it. */
export function resumeUrl(url: string, seconds: number): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    const t = Math.max(0, Math.floor(seconds) - 3); // a few seconds back, for context
    if (host === 'youtube.com' || host === 'youtu.be') {
      u.searchParams.set('t', `${t}s`);
      return u.toString();
    }
    if (host === 'vimeo.com') {
      u.hash = `t=${t}s`;
      return u.toString();
    }
  } catch {
    // fall through
  }
  return url;
}

type MediaVerdict = Pick<Verdict, 'action' | 'reason' | 'confidence'> & { resumeUrl?: string };

/**
 * What a video's progress says about the tab, or null when it says nothing (no video, or barely started).
 * Unfinished is never done: it's saved with the spot you stopped at.
 */
export function mediaVerdict(tab: Pick<TabRecord, 'url' | 'title' | 'lastActiveAt'>, state: PageState | undefined, now: number): MediaVerdict | null {
  const v = state?.video;
  if (!v) return null;
  const recent = now - tab.lastActiveAt < DAY;
  if (v.duration === null) return recent ? { action: 'keep', reason: 'Live stream', confidence: 0.9 } : null;
  const background = BACKGROUND.test(tab.title) || v.duration >= 90 * 60;
  if (background) return recent ? { action: 'keep', reason: 'Background video you use while working', confidence: 0.85 } : null;
  if (v.ended || v.current >= v.duration * WATCHED_FRACTION) return { action: 'done', reason: 'Watched to the end', confidence: 0.9 };
  if (v.current < STARTED_S) return null;
  return {
    action: 'read',
    reason: `Stopped at ${formatClock(v.current)} of ${formatClock(v.duration)}`,
    confidence: 0.9,
    resumeUrl: resumeUrl(tab.url, v.current),
  };
}

// ---- Permissions ----

/** Video sites the video check asks for on its own. With "Unsent text" on, every site is allowed anyway. */
export const VIDEO_ORIGINS = ['*://*.youtube.com/*', '*://*.vimeo.com/*'];
export const ALL_SITES = ['<all_urls>'];

/** Which site permissions the current settings need, so turning one switch off never breaks another. */
export function neededOrigins(s: { readPageText: boolean; checkTyping: boolean; checkVideo: boolean }): string[] {
  if (s.readPageText || s.checkTyping) return ALL_SITES;
  return s.checkVideo ? VIDEO_ORIGINS : [];
}

// ---- Running it in the browser ----

const PROBE_TIMEOUT_MS = 1500;
const timeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

/** Probe one tab, if the site is allowed and the tab is loaded. Undefined when it can't be checked. */
export async function probeTab(tabId: number, opts: ProbeOptions): Promise<PageState | undefined> {
  if (!opts.video && !opts.typing) return undefined;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !/^https?:/.test(tab.url) || tab.discarded || tab.status === 'unloaded') return undefined;
    if (!(await chrome.permissions.contains({ origins: [`${new URL(tab.url).origin}/*`] }))) return undefined;
    const res = await timeout(chrome.scripting.executeScript({ target: { tabId }, func: probePage, args: [opts] }), PROBE_TIMEOUT_MS);
    return (res?.[0]?.result as PageState | undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Probe every open tab in parallel. Never-look sites are skipped before anything runs in them. */
export async function collectPageState(
  tabs: Pick<TabRecord, 'id' | 'tabId' | 'url'>[],
  opts: ProbeOptions,
  excluded: (url: string) => boolean,
): Promise<Map<string, PageState>> {
  const out = new Map<string, PageState>();
  if (!opts.video && !opts.typing) return out;
  await Promise.all(tabs.map(async (t) => {
    if (t.tabId === null || excluded(t.url)) return;
    const s = await probeTab(t.tabId, opts);
    if (s) out.set(t.id, s);
  }));
  return out;
}
