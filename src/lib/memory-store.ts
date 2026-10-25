import type { ActiveSession, SessionStore, TabRecord, TabStore } from './types';

/** In-memory stores. Used by tests and handy for trying the logic without a browser. */
export class MemoryTabStore implements TabStore {
  records = new Map<string, TabRecord>();
  async get(id: string) {
    return this.records.get(id);
  }
  async getOpenByTabId(tabId: number) {
    return [...this.records.values()].find((r) => r.tabId === tabId && r.closedAt === undefined);
  }
  async put(rec: TabRecord) {
    this.records.set(rec.id, rec);
  }
  async listOpen() {
    return [...this.records.values()].filter((r) => r.closedAt === undefined);
  }
  async listClosed() {
    return [...this.records.values()].filter((r) => r.closedAt !== undefined);
  }
}

export class MemorySessionStore implements SessionStore {
  value: ActiveSession | null = null;
  async get() {
    return this.value;
  }
  async set(s: ActiveSession | null) {
    this.value = s;
  }
}
