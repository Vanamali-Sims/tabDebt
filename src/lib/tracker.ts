import type { ActiveSession, SessionStore, TabInfo, TabRecord, TabStore } from './types';

/** A session longer than this is assumed to include time we missed an idle event for. */
export const MAX_SESSION_MS = 2 * 60 * 60 * 1000;

const isTrackable = (url: string) => !!url && !url.startsWith('chrome-extension://') && url !== 'about:blank';

/**
 * Records how you use tabs. Works from timestamps rather than a running timer,
 * because Chrome puts extension workers to sleep after about 30 seconds of quiet.
 */
export class Tracker {
  constructor(
    private store: TabStore,
    private session: SessionStore,
    private now: () => number = Date.now,
  ) {}

  /** Create or refresh the record for a live tab. */
  async upsert(info: TabInfo): Promise<TabRecord | undefined> {
    if (!isTrackable(info.url)) return undefined;
    const t = this.now();
    const existing = await this.store.getOpenByTabId(info.id);
    if (existing) {
      const next: TabRecord = {
        ...existing,
        url: info.url || existing.url,
        title: info.title || existing.title,
        favIconUrl: info.favIconUrl ?? existing.favIconUrl,
        pinned: info.pinned ?? existing.pinned,
        audible: info.audible ?? existing.audible,
      };
      await this.store.put(next);
      return next;
    }
    const opener = info.openerTabId !== undefined ? await this.store.getOpenByTabId(info.openerTabId) : undefined;
    const rec: TabRecord = {
      id: crypto.randomUUID(),
      tabId: info.id,
      url: info.url,
      title: info.title || info.url,
      favIconUrl: info.favIconUrl,
      openerTabId: info.openerTabId,
      openerRecordId: opener?.id,
      pinned: !!info.pinned,
      audible: !!info.audible,
      openedAt: t,
      lastActiveAt: t,
      activeMs: 0,
      visits: 0,
    };
    await this.store.put(rec);
    return rec;
  }

  /** The user switched to this tab. */
  async activated(info: TabInfo): Promise<void> {
    await this.pause();
    await this.begin(info, true);
  }

  /** Browser regained focus or the user came back from idle: restart the clock without counting a new visit. */
  async resume(info: TabInfo | undefined): Promise<void> {
    if (!info) return;
    await this.pause();
    await this.begin(info, false);
  }

  /** Stop the clock: window lost focus, user went idle, or another tab took over. */
  async pause(): Promise<void> {
    const s = await this.session.get();
    if (!s) return;
    const t = this.now();
    const rec = await this.store.get(s.recordId);
    if (rec) {
      const elapsed = Math.max(0, Math.min(t - s.since, MAX_SESSION_MS));
      await this.store.put({ ...rec, activeMs: rec.activeMs + elapsed, lastActiveAt: t });
    }
    await this.session.set(null);
  }

  async removed(tabId: number, by: TabRecord['closedBy'] = 'user'): Promise<void> {
    const rec = await this.store.getOpenByTabId(tabId);
    if (!rec) return;
    const s = await this.session.get();
    if (s?.recordId === rec.id) await this.pause();
    const fresh = (await this.store.get(rec.id)) ?? rec;
    await this.store.put({ ...fresh, tabId: null, closedAt: this.now(), closedBy: by });
  }

  /**
   * Line our records up with the tabs that are really open. Runs on startup,
   * when tab ids may have been reassigned.
   */
  async reconcile(open: TabInfo[]): Promise<void> {
    const t = this.now();
    await this.session.set(null);
    const records = await this.store.listOpen();
    const claimed = new Set<string>();
    const unmatched: TabInfo[] = [];

    for (const info of open) {
      const same = records.find((r) => !claimed.has(r.id) && r.tabId === info.id && r.url === info.url);
      if (same) claimed.add(same.id);
      else unmatched.push(info);
    }
    const leftovers: TabInfo[] = [];
    for (const info of unmatched) {
      const byUrl = records.find((r) => !claimed.has(r.id) && r.url === info.url);
      if (byUrl) {
        claimed.add(byUrl.id);
        await this.store.put({ ...byUrl, tabId: info.id, title: info.title || byUrl.title, pinned: !!info.pinned });
      } else leftovers.push(info);
    }
    for (const r of records) {
      if (!claimed.has(r.id)) await this.store.put({ ...r, tabId: null, closedAt: t, closedBy: 'unknown' });
    }
    for (const info of leftovers) {
      // tabId may collide with a stale record; those were closed just above.
      await this.upsert(info);
    }
  }

  private async begin(info: TabInfo, countVisit: boolean): Promise<void> {
    const rec = await this.upsert(info);
    if (!rec) return;
    const t = this.now();
    await this.store.put({ ...rec, lastActiveAt: t, visits: rec.visits + (countVisit ? 1 : 0) });
    const s: ActiveSession = { recordId: rec.id, since: t };
    await this.session.set(s);
  }
}
