/** A tab as we remember it. Chrome tab ids are not stable across restarts, so we keep our own id. */
export interface TabRecord {
  id: string;
  /** Current Chrome tab id, or null once the tab is gone. */
  tabId: number | null;
  url: string;
  title: string;
  favIconUrl?: string;
  openerTabId?: number;
  /** Our id of the tab that opened this one, when known. */
  openerRecordId?: string;
  pinned: boolean;
  audible: boolean;
  openedAt: number;
  lastActiveAt: number;
  /** Total time spent actively viewing the tab. */
  activeMs: number;
  visits: number;
  closedAt?: number;
  closedBy?: 'user' | 'agent' | 'unknown';
}

/** The slice of chrome.tabs.Tab the tracker needs, so it can be tested without Chrome. */
export interface TabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  openerTabId?: number;
  pinned?: boolean;
  audible?: boolean;
}

export interface ActiveSession {
  recordId: string;
  since: number;
}

export interface TabStore {
  get(id: string): Promise<TabRecord | undefined>;
  getOpenByTabId(tabId: number): Promise<TabRecord | undefined>;
  put(rec: TabRecord): Promise<void>;
  listOpen(): Promise<TabRecord[]>;
  listClosed(): Promise<TabRecord[]>;
  delete(id: string): Promise<void>;
}

export interface SessionStore {
  get(): Promise<ActiveSession | null>;
  set(s: ActiveSession | null): Promise<void>;
}

/** What the agent can propose for a tab. */
export type Action = 'done' | 'read' | 'project' | 'task' | 'keep';

export interface TaskDraft {
  title: string;
  due?: string;
}

/** One decision about one tab, with the reason shown to the user. */
export interface Verdict {
  recordId: string;
  action: Action;
  reason: string;
  confidence: number;
  source: 'rules' | 'memory' | 'agent' | 'fallback' | 'user';
  /** What the agent looked at before deciding, for the "why" view and debugging. */
  looked?: string[];
  /** Set when the page tried to give the agent instructions. */
  flagged?: boolean;
  project?: string;
  summary?: string;
  task?: TaskDraft;
}

export interface SavedItem {
  id: string;
  kind: 'task' | 'read' | 'project';
  title: string;
  url: string;
  summary?: string;
  project?: string;
  due?: string;
  done: boolean;
  createdAt: number;
  runId: string;
}

/** What actually happened to one tab when a plan was applied. */
export interface AppliedDecision {
  recordId: string;
  action: Action;
  url: string;
  title: string;
  itemId?: string;
  /** Why it was proposed and who decided, kept so a surprising close can be explained later. */
  reason: string;
  source: Verdict['source'];
  looked?: string[];
  confidence: number;
}

/** One applied review, kept so it can be undone. */
export interface Run {
  id: string;
  at: number;
  applied: AppliedDecision[];
  undoneAt?: number;
}

/** A correction the user made that should shape future reviews. */
export interface MemoryRule {
  host: string;
  action: 'keep';
  count: number;
  updatedAt: number;
}

export interface ItemStore {
  get(id: string): Promise<SavedItem | undefined>;
  put(item: SavedItem): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<SavedItem[]>;
}

export interface RunStore {
  get(id: string): Promise<Run | undefined>;
  put(run: Run): Promise<void>;
  latest(): Promise<Run | undefined>;
  list(): Promise<Run[]>;
  delete(id: string): Promise<void>;
}

export interface MemoryStore {
  list(): Promise<MemoryRule[]>;
  get(host: string): Promise<MemoryRule | undefined>;
  put(rule: MemoryRule): Promise<void>;
  delete(host: string): Promise<void>;
}

export interface Repos {
  tabs: TabStore;
  items: ItemStore;
  runs: RunStore;
  memory: MemoryStore;
}

/** A verdict plus whether the user left it ticked in the review. */
export type PlanEntry = Verdict & { approved: boolean };
