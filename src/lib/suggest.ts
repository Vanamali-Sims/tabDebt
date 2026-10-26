/**
 * Bare-minimum autocomplete: finish the word being typed from a list of known words.
 * Prefix match on the last word, most frequent first, then shortest. No fuzzy matching or ranking by
 * meaning yet; this is the seam where something smarter can plug in later.
 */
export function buildVocabulary(texts: string[], minLength = 3): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const w of text.toLowerCase().split(/[^a-z0-9.\-]+/)) {
      const word = w.replace(/^[.\-]+|[.\-]+$/g, '');
      if (word.length >= minLength) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0])).map(([w]) => w);
}

/** The full text the input would become if the suggestion were accepted, or null when nothing fits. */
export function completeLastWord(value: string, vocabulary: string[]): string | null {
  const match = /([^\s]*)$/.exec(value);
  const prefix = (match?.[1] ?? '').toLowerCase();
  if (prefix.length < 2) return null;
  const hit = vocabulary.find((w) => w.startsWith(prefix) && w !== prefix);
  if (!hit) return null;
  return value.slice(0, value.length - prefix.length) + hit;
}
