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
  source: 'rules' | 'memory' | 'agent' | 'fallback';
  project?: string;
  summary?: string;
  task?: TaskDraft;
}
