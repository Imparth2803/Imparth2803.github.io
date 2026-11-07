/* Letter-case changes, using Unicode's standard rules (the same result on
   every computer, whatever its language setting).

   Title Case rules (shown to people in the tools):
   - Each word starts with a capital; the rest of the word is lower case.
   - Small words (a, an, and, as, at, but, by, for, in, nor, of, on, or, the,
     to, vs, via) stay lower case, except as the first or last word.
   - A word written in capitals (like NASA or HR) stays in capitals when it
     stands alone. Several capital words in a row, or text that is all in
     capitals, is treated as shouting, not acronyms.
   - Each part of a hyphenated word is capitalised (Jean-Luc). */

export type LetterCase =
  | "keep"
  | "upper"
  | "lower"
  | "title"
  | "sentence"
  | "each-word";

const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "in",
  "nor",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "via"
]);

export const SENTENCE_CASE_RULE =
  "Everything is lower case except the first letter of each sentence. A sentence starts at the beginning, on each new line, and after . ! or ?. The word “i” becomes “I”. A word in capitals like “NASA” is kept when it stands alone.";

export const EACH_WORD_RULE =
  "Every word starts with a capital and the rest is lower case, including small words like “of” and words in capitals.";

export const TITLE_CASE_RULE =
  "Each word starts with a capital. Small words like “of”, “and” and “the” stay lower case unless they come first or last. A word in capitals like “NASA” is kept when it stands alone.";

export function changeCase(text: string, letterCase: LetterCase): string {
  switch (letterCase) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return toTitleCase(text);
    case "sentence":
      return toSentenceCase(text);
    case "each-word":
      return text
        .split(/(\s+)/)
        .map(word =>
          word.trim() ? word.split("-").map(capitalize).join("-") : word
        )
        .join("");
    default:
      return text;
  }
}

const hasLower = (s: string) => s !== s.toUpperCase();
const hasUpper = (s: string) => s !== s.toLowerCase();
const isCapsWord = (w: string) =>
  hasUpper(w) && !hasLower(w) && /\p{L}{2,}/u.test(w);

/* For each piece of `split(/(\s+)/)`: is it an acronym to keep? Only a
   capital word whose neighbouring words aren't also in capitals, in text
   that has some lower case. */
function acronymFlags(pieces: string[]): boolean[] {
  const flags = pieces.map(() => false);
  if (!hasLower(pieces.join(""))) return flags;
  const words = pieces.map((p, i) => (p.trim() ? i : -1)).filter(i => i !== -1);
  words.forEach((index, n) => {
    const prev = words[n - 1];
    const next = words[n + 1];
    flags[index] =
      isCapsWord(pieces[index]!) &&
      !(prev !== undefined && isCapsWord(pieces[prev]!)) &&
      !(next !== undefined && isCapsWord(pieces[next]!));
  });
  return flags;
}

/* Lower-cases a word and capitalises its first letter ("(HELLO" -> "(Hello"). */
function capitalize(part: string): string {
  return part.toLowerCase().replace(/\p{L}/u, letter => letter.toUpperCase());
}

export function toTitleCase(text: string): string {
  const words = text.split(/(\s+)/);
  const acronyms = acronymFlags(words);
  const wordIndexes = words
    .map((w, i) => (w.trim() ? i : -1))
    .filter(i => i !== -1);
  const firstWord = wordIndexes[0];
  const lastWord = wordIndexes[wordIndexes.length - 1];
  return words
    .map((word, i) => {
      if (!word.trim()) return word;
      if (acronyms[i]) return word;
      const lower = word.toLowerCase();
      if (i !== firstWord && i !== lastWord && SMALL_WORDS.has(lower))
        return lower;
      return word.split("-").map(capitalize).join("-");
    })
    .join("");
}

export function toSentenceCase(text: string): string {
  const pieces = text.split(/(\s+)/);
  const acronyms = acronymFlags(pieces);
  let startOfSentence = true;
  return pieces
    .map((word, i) => {
      if (!word.trim()) {
        if (/[\r\n]/.test(word)) startOfSentence = true;
        return word;
      }
      let out: string;
      if (acronyms[i]) {
        out = word;
      } else if (startOfSentence) {
        out = capitalize(word);
      } else {
        out = word.toLowerCase().replace(/^i(?=$|[^\p{L}])/u, "I");
      }
      startOfSentence = /[.!?]["')\]]*$/.test(word);
      return out;
    })
    .join("");
}
