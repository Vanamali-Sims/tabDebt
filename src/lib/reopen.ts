import type { PickUp } from './brief';

/** Short enough for a tab group label. */
export const groupTitle = (title: string) => (title.length > 24 ? `${title.slice(0, 23).trimEnd()}…` : title);

/**
 * Brings the pick-up back as one tab group in the current window and focuses its first tab. Tabs that are
 * already open are moved into the group rather than opened twice.
 */
export async function reopenAsGroup(p: PickUp): Promise<number> {
  const win = await chrome.windows.getLastFocused();
  const open = await chrome.tabs.query({});
  const ids: number[] = [];
  for (const t of p.tabs) {
    const existing = open.find((o) => o.url === t.url && o.id !== undefined);
    if (existing?.id !== undefined) ids.push(existing.id);
    else {
      const created = await chrome.tabs.create({ url: t.url, active: false, windowId: win.id });
      if (created.id !== undefined) ids.push(created.id);
    }
  }
  if (ids.length === 0) return 0;
  if (ids.length > 1) {
    try {
      const groupId: number = await chrome.tabs.group({ tabIds: ids as [number, ...number[]], createProperties: { windowId: win.id } });
      await chrome.tabGroups.update(groupId, { title: groupTitle(p.title), color: 'green' });
    } catch {
      // Grouping is a nicety. The tabs are open either way.
    }
  }
  await chrome.tabs.update(ids[0]!, { active: true });
  if (win.id !== undefined) await chrome.windows.update(win.id, { focused: true });
  return ids.length;
}
