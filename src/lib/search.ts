import { hostOf } from './format';
import type { SavedItem, TabRecord } from './types';

export interface SearchHit {
  kind: 'closed' | 'saved';
  title: string;
  url: string;
  when: number;
  note?: string;
  score: number;
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);

/**
 * Plain keyword search over closed tabs and saved items. Every word must appear somewhere in the
 * title, address or summary; title matches rank higher. Meaning-based search can replace this later.
 */
export function searchClosed(query: string, closed: TabRecord[], items: SavedItem[], limit = 20): SearchHit[] {
  const words = tokens(query);
  if (words.length === 0) return [];
  const hits: SearchHit[] = [];

  const score = (title: string, haystack: string) => {
    let s = 0;
    for (const w of words) {
      if (!haystack.includes(w)) return 0;
      s += title.toLowerCase().includes(w) ? 3 : 1;
    }
    return s;
  };

  for (const t of closed) {
    const s = score(t.title, `${t.title} ${t.url} ${hostOf(t.url)}`.toLowerCase());
    if (s > 0) hits.push({ kind: 'closed', title: t.title, url: t.url, when: t.closedAt ?? t.lastActiveAt, score: s });
  }
  for (const i of items) {
    const s = score(i.title, `${i.title} ${i.url} ${i.summary ?? ''} ${i.project ?? ''}`.toLowerCase());
    if (s > 0) hits.push({ kind: 'saved', title: i.title, url: i.url, when: i.createdAt, note: i.summary ?? i.project, score: s + 1 });
  }
  return hits.sort((a, b) => b.score - a.score || b.when - a.when).slice(0, limit);
}
