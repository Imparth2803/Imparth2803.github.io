import {changeCase, LetterCase} from "../../../shared/text/letterCase";
import {nfc, splitLines} from "../../../shared/text/normalize";

export type WrapMode = "word" | "exact";
export type LineOrder = "keep" | "az" | "za" | "reverse";

export interface FormatOptions {
  removeNumbering: boolean;
  removeSpecial: boolean;
  removeNumbers: boolean;
  removePunctuation: boolean;
  find: string;
  replaceWith: string;
  matchCase: boolean;
  trimLines: boolean;
  collapseSpaces: boolean;
  letterCase: LetterCase;
  removeLineBreaks: boolean;
  lineOrder: LineOrder;
  /** Break lines longer than this many characters (null: don't). */
  wrapAt: number | null;
  wrapMode: WrapMode;
  addNumbering: boolean;
  prefix: string;
  suffix: string;
}

/* The steps, always in this order (shown on the page). */
export const STEPS = [
  "Remove existing numbering",
  "Remove special characters, numbers or punctuation",
  "Find and replace",
  "Remove spaces at the start and end of lines, and extra spaces",
  "Change letter case",
  "Remove line breaks",
  "Sort or reverse the lines",
  "Add line breaks after a number of characters",
  "Add numbering",
  "Add text to the start and end of each line"
];

/* Unicode files some symbols office users think of as "special" (@ # % & *
   / _) under punctuation, so the two groups are defined here:
   special = symbols such as @ # $ % & * + = / < > | ~ ^ _ and emoji;
   punctuation = sentence marks such as . , ; : ! ? ' " - ( ) [ ]. */
const SPECIAL_PUNCTUATION = "@#%&*/\\_§¶†‡•※";
const SPECIAL = new RegExp(
  `[\\p{S}${SPECIAL_PUNCTUATION.replace(/[\\\]^-]/g, "\\$&")}]`,
  "gu"
);
const PUNCTUATION = /\p{P}/gu;
const NUMBERS = /\p{N}/gu;
/* "1. ", "2) ", "(3) ", "4: ", "5 - " at the start of a line. A space must
   follow, so "3.5 kg" is left alone. */
const NUMBERING = /^(\s*)(?:\(\d+\)|\d+[.):\]]|\d+\s+-)\s+/;

export function formatText(input: string, o: FormatOptions): string {
  let lines = splitLines(nfc(input));

  if (o.removeNumbering)
    lines = lines.map(line => line.replace(NUMBERING, "$1"));
  if (o.removeSpecial) lines = lines.map(line => line.replace(SPECIAL, ""));
  if (o.removeNumbers) lines = lines.map(line => line.replace(NUMBERS, ""));
  if (o.removePunctuation) {
    lines = lines.map(line =>
      line.replace(PUNCTUATION, mark =>
        SPECIAL_PUNCTUATION.includes(mark) ? mark : ""
      )
    );
  }
  if (o.find)
    lines = replaceAll(
      lines.join("\n"),
      o.find,
      o.replaceWith,
      o.matchCase
    ).split("\n");
  if (o.trimLines) lines = lines.map(line => line.trim());
  if (o.collapseSpaces)
    lines = lines.map(line => line.replace(/[^\S\n]{2,}/g, " "));
  // Line by line: each line is its own title or sentence, and a line in all
  // capitals is treated as shouting, not as acronyms.
  if (o.letterCase !== "keep")
    lines = lines.map(line => changeCase(line, o.letterCase));
  if (o.removeLineBreaks) {
    lines = [
      lines
        .map(line => line.trim())
        .filter(Boolean)
        .join(" ")
    ];
  }
  if (o.lineOrder === "reverse") lines = [...lines].reverse();
  else if (o.lineOrder !== "keep") {
    const collator = new Intl.Collator(undefined, {
      sensitivity: "base",
      numeric: true
    });
    lines = [...lines].sort(collator.compare);
    if (o.lineOrder === "za") lines.reverse();
  }
  if (o.wrapAt !== null && o.wrapAt > 0) {
    const width = o.wrapAt;
    lines = lines.flatMap(line =>
      o.wrapMode === "word" ? wrapWords(line, width) : wrapExact(line, width)
    );
  }
  if (o.addNumbering) {
    let n = 0;
    lines = lines.map(line => (line.trim() ? `${++n}. ${line}` : line));
  }
  if (o.prefix || o.suffix) {
    lines = lines.map(line =>
      line.trim() ? o.prefix + line + o.suffix : line
    );
  }
  return lines.join("\n");
}

/* Plain-text replace (no patterns, so nothing typed can freeze the page). */
export function replaceAll(
  text: string,
  find: string,
  replacement: string,
  matchCase: boolean
): string {
  if (!find) return text;
  if (matchCase) return text.split(find).join(replacement);
  const lowerText = text.toLowerCase();
  const lowerFind = find.toLowerCase();
  // Lower-casing can change length for a few characters (e.g. "İ"); fall back
  // to an exact match then, rather than replacing the wrong span.
  if (lowerText.length !== text.length || lowerFind.length !== find.length) {
    return text.split(find).join(replacement);
  }
  let out = "";
  let from = 0;
  for (
    let at = lowerText.indexOf(lowerFind);
    at !== -1;
    at = lowerText.indexOf(lowerFind, from)
  ) {
    out += text.slice(from, at) + replacement;
    from = at + find.length;
  }
  return out + text.slice(from);
}

/* Breaks after the last whole word that fits; words longer than the width
   are broken where they must be. */
export function wrapWords(line: string, width: number): string[] {
  if (Array.from(line).length <= width) return [line];
  const out: string[] = [];
  let current = "";
  for (const word of line.split(/\s+/).filter(Boolean)) {
    const chars = Array.from(word);
    if (chars.length > width) {
      if (current) out.push(current);
      const pieces = wrapExact(word, width);
      current = pieces.pop() ?? "";
      out.push(...pieces);
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (Array.from(candidate).length <= width) current = candidate;
    else {
      out.push(current);
      current = word;
    }
  }
  if (current || out.length === 0) out.push(current);
  return out;
}

/* Breaks exactly every `width` characters. */
export function wrapExact(line: string, width: number): string[] {
  const chars = Array.from(line);
  if (chars.length <= width) return [line];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += width)
    out.push(chars.slice(i, i + width).join(""));
  return out;
}

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  lines: number;
}

export function textStats(text: string): TextStats {
  const chars = Array.from(text);
  return {
    words: (text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? []).length,
    characters: chars.filter(ch => ch !== "\n" && ch !== "\r").length,
    charactersNoSpaces: chars.filter(ch => !/\s/.test(ch)).length,
    lines: text === "" ? 0 : splitLines(text).length
  };
}
