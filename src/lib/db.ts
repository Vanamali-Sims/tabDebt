import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ActiveSession, SessionStore, TabRecord, TabStore } from './types';

interface TabDebtDB extends DBSchema {
  tabs: {
    key: string;
    value: TabRecord;
    indexes: { 'by-tabId': number; 'by-closedAt': number };
  };
}

let dbPromise: Promise<IDBPDatabase<TabDebtDB>> | undefined;

export function getDB() {
  dbPromise ??= openDB<TabDebtDB>('tab-debt', 1, {
    upgrade(db) {
      const tabs = db.createObjectStore('tabs', { keyPath: 'id' });
      tabs.createIndex('by-tabId', 'tabId');
      tabs.createIndex('by-closedAt', 'closedAt');
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
