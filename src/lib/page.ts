import type { PageSnapshot } from './agent/agent';

/**
 * Reads the start of a page's text. Only works when the user has turned on page reading and granted
 * the optional site permission; otherwise returns null and the agent decides from the title and address.
 */
export async function readPage(tabId: number): Promise<PageSnapshot | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !/^https?:/.test(tab.url)) return null;
    const origin = `${new URL(tab.url).origin}/*`;
    if (!(await chrome.permissions.contains({ origins: [origin] }))) return null;
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ title: document.title, text: (document.body?.innerText ?? '').slice(0, 4000) }),
    });
    return (res?.result as PageSnapshot | undefined) ?? null;
  } catch {
    return null;
  }
}
