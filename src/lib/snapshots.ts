const KEEP_DAYS = 14;

export type Snapshots = Record<string, number>;

/** Local calendar day, e.g. 2026-10-26. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function loadSnapshots(): Promise<Snapshots> {
  const { snapshots } = await chrome.storage.local.get('snapshots');
  return (snapshots as Snapshots | undefined) ?? {};
}

/** Remember how many tabs were open today. The last value of the day is what tomorrow compares against. */
export async function recordSnapshot(count: number, now: Date = new Date()): Promise<void> {
  const snaps = await loadSnapshots();
  if (snaps[dayKey(now)] === count) return;
  snaps[dayKey(now)] = count;
  const keep = Object.keys(snaps).sort().slice(-KEEP_DAYS);
  await chrome.storage.local.set({ snapshots: Object.fromEntries(keep.map((k) => [k, snaps[k]!])) });
}

/** Tabs open now minus tabs open at the end of yesterday, or null when there is no yesterday to compare to. */
export function changeSinceYesterday(snaps: Snapshots, nowCount: number, now: Date = new Date()): number | null {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const before = snaps[dayKey(y)];
  return before === undefined ? null : nowCount - before;
}
