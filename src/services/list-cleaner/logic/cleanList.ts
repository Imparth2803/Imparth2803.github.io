import {changeCase, LetterCase} from "../../../shared/text/letterCase";
import {nfc} from "../../../shared/text/normalize";

export type SortOrder = "none" | "az" | "za" | "small-large" | "large-small";

export interface CleanOptions {
  trim: boolean;
  collapseSpaces: boolean;
  removeSpecial: boolean;
  removeNumbers: boolean;
  removeLetters: boolean;
  letterCase: LetterCase;
  /** Entries containing any of these (ignoring case) are removed. */
  blockedWords: string[];
  minLength: number | null;
  maxLength: number | null;
  removeEmpty: boolean;
  removeDuplicates: boolean;
  /** For duplicates: treat "Parth" and "PARTH" as the same. */
  ignoreCase: boolean;
  sort: SortOrder;
}

export type RemovalReason = "empty" | "duplicate" | "word" | "short" | "long";

export const REASON_LABELS: Record<RemovalReason, string> = {
  empty: "Empty",
  duplicate: "Repeated",
  word: "Contains a word you listed",
  short: "Too short",
  long: "Too long"
};

export interface Removed {
  /** The entry as it was in the input. */
  original: string;
  /** 1-based position in the input. */
  line: number;
  reason: RemovalReason;
}

export interface CleanResult {
  kept: string[];
  removed: Removed[];
}

/* The steps, always in this order (shown on the page too). */
export const STEPS = [
  "Remove spaces at the start and end",
  "Turn several spaces into one",
  "Remove special characters, numbers or letters",
  "Change letter case",
  "Remove entries by word or length",
  "Remove empty entries",
  "Remove repeated entries",
  "Sort"
];

const SPECIAL = /[^\p{L}\p{M}\p{N}\s]/gu;
const NUMBERS = /\p{N}/gu;
const LETTERS = /[\p{L}\p{M}]/gu;

export function cleanList(
  input: readonly string[],
  options: CleanOptions
): CleanResult {
  const removed: Removed[] = [];
  const blocked = options.blockedWords
    .map(word => nfc(word.trim()).toLowerCase())
    .filter(Boolean);

  // Steps 1–5, entry by entry.
  let entries: {value: string; original: string; line: number}[] = [];
  input.forEach((original, i) => {
    let value = nfc(original);
    const tidy = (text: string) => {
      let out = text;
      if (options.trim) out = out.trim();
      if (options.collapseSpaces) out = out.replace(/[^\S\r\n]{2,}/g, " ");
      return out;
    };
    value = tidy(value);
    if (
      options.removeSpecial ||
      options.removeNumbers ||
      options.removeLetters
    ) {
      if (options.removeSpecial) value = value.replace(SPECIAL, "");
      if (options.removeNumbers) value = value.replace(NUMBERS, "");
      if (options.removeLetters) value = value.replace(LETTERS, "");
      value = tidy(value); // removing characters can leave stray spaces
    }
    value = changeCase(value, options.letterCase);

    const line = i + 1;
    if (value !== "") {
      const lower = value.toLowerCase();
      const length = Array.from(value).length;
      if (blocked.some(word => lower.includes(word))) {
        removed.push({original, line, reason: "word"});
        return;
      }
      if (options.minLength !== null && length < options.minLength) {
        removed.push({original, line, reason: "short"});
        return;
      }
      if (options.maxLength !== null && length > options.maxLength) {
        removed.push({original, line, reason: "long"});
        return;
      }
    }
    entries.push({value, original, line});
  });

  // Step 6: empty entries.
  if (options.removeEmpty) {
    entries = entries.filter(entry => {
      if (entry.value !== "") return true;
      removed.push({
        original: entry.original,
        line: entry.line,
        reason: "empty"
      });
      return false;
    });
  }

  // Step 7: repeats (the first one is kept).
  if (options.removeDuplicates) {
    const seen = new Set<string>();
    entries = entries.filter(entry => {
      const key = options.ignoreCase ? entry.value.toLowerCase() : entry.value;
      if (!seen.has(key)) {
        seen.add(key);
        return true;
      }
      removed.push({
        original: entry.original,
        line: entry.line,
        reason: "duplicate"
      });
      return false;
    });
  }

  removed.sort((a, b) => a.line - b.line);
  return {
    kept: sortValues(
      entries.map(entry => entry.value),
      options.sort
    ),
    removed
  };
}

/* Step 8. A–Z ignores letter case and accents, and puts "Item 2" before
   "Item 10". Number sorts put entries that aren't numbers last, in their
   original order. Equal entries keep their original order. */
export function sortValues(values: string[], order: SortOrder): string[] {
  if (order === "none") return values;
  if (order === "az" || order === "za") {
    const collator = new Intl.Collator(undefined, {
      sensitivity: "base",
      numeric: true
    });
    const sorted = [...values].sort(collator.compare);
    return order === "az" ? sorted : sorted.reverse();
  }
  const numbered = values.map(value => ({value, n: toNumber(value)}));
  const numbers = numbered.filter(item => item.n !== null);
  const others = numbered
    .filter(item => item.n === null)
    .map(item => item.value);
  numbers.sort((a, b) => (order === "small-large" ? a.n! - b.n! : b.n! - a.n!));
  return [...numbers.map(item => item.value), ...others];
}

/* "1,250.50", " -3 ", "42" -> numbers; anything else -> null. */
function toNumber(value: string): number | null {
  const text = value.trim().replace(/,(?=\d{3}\b)/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  return Number(text);
}
