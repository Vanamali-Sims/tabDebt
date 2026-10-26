import { hostOf } from './format';
import type { TabRecord } from './types';

export interface HostGroup {
  host: string;
  /** Most recently used first. */
  tabs: TabRecord[];
  lastActiveAt: number;
  activeMs: number;
}

/** Collapse tabs from the same site into one entry so ten tabs read as a handful of rows. */
export function groupByHost(tabs: TabRecord[]): HostGroup[] {
  const map = new Map<string, TabRecord[]>();
  for (const t of tabs) {
    const host = hostOf(t.url);
    map.set(host, [...(map.get(host) ?? []), t]);
  }
  return [...map].map(([host, list]) => {
    const sorted = [...list].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    return { host, tabs: sorted, lastActiveAt: sorted[0]!.lastActiveAt, activeMs: list.reduce((n, t) => n + t.activeMs, 0) };
  }).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}
