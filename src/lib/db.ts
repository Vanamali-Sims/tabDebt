import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  ActiveSession,
  ItemStore,
  MemoryRule,
  MemoryStore,
  Repos,
  Run,
  RunStore,
  SavedItem,
  SessionStore,
  TabRecord,
  TabStore,
} from './types';

interface TabDebtDB extends DBSchema {
  tabs: {
    key: string;
    value: TabRecord;
    indexes: { 'by-tabId': number; 'by-closedAt': number };
  };
  items: { key: string; value: SavedItem };
  runs: { key: string; value: Run; indexes: { 'by-at': number } };
  memory: { key: string; value: MemoryRule };
}

let dbPromise: Promise<IDBPDatabase<TabDebtDB>> | undefined;

export function getDB() {
  dbPromise ??= openDB<TabDebtDB>('tab-debt', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const tabs = db.createObjectStore('tabs', { keyPath: 'id' });
        tabs.createIndex('by-tabId', 'tabId');
        tabs.createIndex('by-closedAt', 'closedAt');
      }
      if (oldVersion < 2) {
        db.createObjectStore('items', { keyPath: 'id' });
        db.createObjectStore('runs', { keyPath: 'id' }).createIndex('by-at', 'at');
        db.createObjectStore('memory', { keyPath: 'host' });
      }
    },
  });
  return dbPromise;
}

export class IdbTabStore implements TabStore {
  async get(id: string) {
    return (await getDB()).get('tabs', id);
  }
  async getOpenByTabId(tabId: number) {
    const rows = await (await getDB()).getAllFromIndex('tabs', 'by-tabId', tabId);
    return rows.find((r) => r.closedAt === undefined);
  }
  async put(rec: TabRecord) {
    await (await getDB()).put('tabs', rec);
  }
  async listOpen() {
    return (await (await getDB()).getAll('tabs')).filter((r) => r.closedAt === undefined);
  }
  async listClosed() {
    return (await (await getDB()).getAll('tabs')).filter((r) => r.closedAt !== undefined);
  }
}

export class IdbItemStore implements ItemStore {
  async get(id: string) {
    return (await getDB()).get('items', id);
  }
  async put(item: SavedItem) {
    await (await getDB()).put('items', item);
  }
  async delete(id: string) {
    await (await getDB()).delete('items', id);
  }
  async list() {
    return (await getDB()).getAll('items');
  }
}

export class IdbRunStore implements RunStore {
  async get(id: string) {
    return (await getDB()).get('runs', id);
  }
  async put(run: Run) {
    await (await getDB()).put('runs', run);
  }
  async latest() {
    const rows = await (await getDB()).getAllFromIndex('runs', 'by-at');
    return rows[rows.length - 1];
  }
}

export class IdbMemoryStore implements MemoryStore {
  async list() {
    return (await getDB()).getAll('memory');
  }
  async get(host: string) {
    return (await getDB()).get('memory', host);
  }
  async put(rule: MemoryRule) {
    await (await getDB()).put('memory', rule);
  }
}

export const idbRepos = (): Repos => ({
  tabs: new IdbTabStore(),
  items: new IdbItemStore(),
  runs: new IdbRunStore(),
  memory: new IdbMemoryStore(),
});

/** The running clock lives in chrome.storage.session so it survives the worker sleeping but not a browser restart. */
export class ChromeSessionStore implements SessionStore {
  async get() {
    const { active } = await chrome.storage.session.get('active');
    return (active as ActiveSession | undefined) ?? null;
  }
  async set(s: ActiveSession | null) {
    if (s) await chrome.storage.session.set({ active: s });
    else await chrome.storage.session.remove('active');
  }
}
