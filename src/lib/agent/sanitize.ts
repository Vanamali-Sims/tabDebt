/**
 * Web pages are written by strangers, and the agent reads them. Everything from a page is treated as
 * data: cleaned here, wrapped in a marked block, and checked for text that looks like it is
 * giving orders to an AI. The agent also has no tool that can close or change anything, so even a
 * successful trick could only change a proposal the user still has to approve.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any |your |the )?(previous|prior|above|earlier) (instructions|prompts|messages)/i,
  /disregard (all |the |your )?(previous|prior|system|above)/i,
  /\bsystem prompt\b/i,
  /\bnew instructions\b/i,
  /you are (now )?(an? )?(ai|assistant|agent|language model)/i,
  /\b(close|delete|remove|dismiss) (all|every|the other) (of )?(the |your )?tabs\b/i,
  /\bsubmit_plan\b|\bread_page\b|\bfind_related\b/i,
  /as an? (ai|assistant|agent)[, ]/i,
];

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

export interface CleanText {
  text: string;
  flagged: boolean;
}

export function sanitizePageText(raw: string, max = 1500): CleanText {
  const flagged = looksLikeInjection(raw);
  const text = raw
    // control characters and zero-width characters used to hide text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f​-‏⁠﻿]/g, '')
    // stop the page from closing our wrapper or opening its own tags
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return { text, flagged };
}

/** The only form in which page text reaches the model. */
export function wrapUntrusted(text: string): string {
  return `<untrusted_page_text>\n${text}\n</untrusted_page_text>`;
}
