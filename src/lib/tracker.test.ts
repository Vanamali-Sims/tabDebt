import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_SESSION_MS, Tracker } from './tracker';
import { MemorySessionStore, MemoryTabStore } from './memory-store';
import type { TabInfo } from './types';

const tab = (id: number, url = `https://example.com/${id}`, extra: Partial<TabInfo> = {}): TabInfo => ({
  id,
  url,
  title: `Tab ${id}`,
  ...extra,
});

describe('Tracker', () => {
  let clock = 0;
  let store: MemoryTabStore;
  let session: MemorySessionStore;
  let tracker: Tracker;

  beforeEach(() => {
    clock = 1_000;
    store = new MemoryTabStore();
    session = new MemorySessionStore();
    tracker = new Tracker(store, session, () => clock);
  });

  it('adds time to the tab you were on when you switch away', async () => {
    await tracker.activated(tab(1));
    clock += 60_000;
    await tracker.activated(tab(2));
    const first = await store.getOpenByTabId(1);
    expect(first?.activeMs).toBe(60_000);
    expect(first?.visits).toBe(1);
  });

  it('counts a return to a tab as another visit', async () => {
    await tracker.activated(tab(1));
    clock += 1_000;
    await tracker.activated(tab(2));
    clock += 1_000;
    await tracker.activated(tab(1));
    expect((await store.getOpenByTabId(1))?.visits).toBe(2);
  });

  it('stops the clock on pause and does not count a visit on resume', async () => {
    await tracker.activated(tab(1));
    clock += 10_000;
    await tracker.pause();
    clock += 500_000; // away from the computer
    await tracker.resume(tab(1));
    clock += 5_000;
    await tracker.pause();
    const rec = await store.getOpenByTabId(1);
    expect(rec?.activeMs).toBe(15_000);
    expect(rec?.visits).toBe(1);
  });

  it('caps a session that probably missed an idle event', async () => {
    await tracker.activated(tab(1));
    clock += MAX_SESSION_MS * 3;
    await tracker.pause();
    expect((await store.getOpenByTabId(1))?.activeMs).toBe(MAX_SESSION_MS);
  });

  it('remembers which tab opened another', async () => {
    await tracker.upsert(tab(1, 'https://google.com/search?q=cats'));
    const child = await tracker.upsert(tab(2, 'https://cats.example/', { openerTabId: 1 }));
    const parent = await store.getOpenByTabId(1);
    expect(child?.openerRecordId).toBe(parent?.id);
  });

  it('marks a closed tab with when and who, and banks its time', async () => {
    await tracker.activated(tab(1));
    clock += 4_000;
    await tracker.removed(1, 'user');
    expect(await store.getOpenByTabId(1)).toBeUndefined();
    const [closed] = await store.listClosed();
    expect(closed).toMatchObject({ tabId: null, closedBy: 'user', activeMs: 4_000, closedAt: clock });
    expect(await session.get()).toBeNull();
  });

  it('ignores extension pages and blank tabs', async () => {
    expect(await tracker.upsert(tab(1, 'chrome-extension://abc/sidepanel.html'))).toBeUndefined();
    expect(await tracker.upsert(tab(2, 'about:blank'))).toBeUndefined();
    expect(await store.listOpen()).toHaveLength(0);
  });

  describe('reconcile after a restart', () => {
    it('keeps history for tabs that came back under new ids', async () => {
      await tracker.activated(tab(1, 'https://docs.example.com/a'));
      clock += 30_000;
      await tracker.pause();
      const before = await store.getOpenByTabId(1);

      await tracker.reconcile([tab(77, 'https://docs.example.com/a')]);
      const after = await store.getOpenByTabId(77);
      expect(after?.id).toBe(before?.id);
      expect(after?.activeMs).toBe(30_000);
    });

    it('closes records for tabs that did not come back and adds new ones', async () => {
      await tracker.upsert(tab(1, 'https://gone.example/'));
      await tracker.reconcile([tab(1, 'https://fresh.example/')]);
      const open = await store.listOpen();
      expect(open.map((r) => r.url)).toEqual(['https://fresh.example/']);
      expect((await store.listClosed()).map((r) => r.url)).toEqual(['https://gone.example/']);
    });
  });
});
