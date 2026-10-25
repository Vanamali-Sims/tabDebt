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

export class MemoryItemStore implements ItemStore {
  items = new Map<string, SavedItem>();
  async get(id: string) {
    return this.items.get(id);
  }
  async put(item: SavedItem) {
    this.items.set(item.id, item);
  }
  async delete(id: string) {
    this.items.delete(id);
  }
  async list() {
    return [...this.items.values()];
  }
}

export class MemoryRunStore implements RunStore {
  runs = new Map<string, Run>();
  async get(id: string) {
    return this.runs.get(id);
  }
  async put(run: Run) {
    this.runs.set(run.id, run);
  }
  async latest() {
    return [...this.runs.values()].sort((a, b) => a.at - b.at).pop();
  }
}

export class MemoryMemoryStore implements MemoryStore {
  rules = new Map<string, MemoryRule>();
  async list() {
    return [...this.rules.values()];
  }
  async get(host: string) {
    return this.rules.get(host);
  }
  async put(rule: MemoryRule) {
    this.rules.set(rule.host, rule);
  }
}

export const memoryRepos = (): Repos => ({
  tabs: new MemoryTabStore(),
  items: new MemoryItemStore(),
  runs: new MemoryRunStore(),
  memory: new MemoryMemoryStore(),
});
