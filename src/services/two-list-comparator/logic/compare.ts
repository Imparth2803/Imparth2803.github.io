import {nfc} from "../../../shared/text/normalize";

export interface CompareOptions {
  /** When off, "Parth" and "PARTH" count as the same. */
  matchCase: boolean;
  /** When on, " Parth " and "Parth" count as the same. */
  ignoreSpaces: boolean;
}

export interface Repeated {
  value: string;
  count: number;
}

export interface CompareResult {
  totalA: number;
  totalB: number;
  blankA: number;
  blankB: number;
  uniqueA: number;
  uniqueB: number;
  both: string[];
  onlyA: string[];
  onlyB: string[];
  repeatedA: Repeated[];
  repeatedB: Repeated[];
}

interface Entry {
  original: string;
  count: number;
}

/* Groups a list by its comparison key, keeping first-seen order and the
   first original spelling. Blank entries are counted, not compared. */
function group(list: readonly string[], key: (v: string) => string) {
  const map = new Map<string, Entry>();
  let blank = 0;
  for (const original of list) {
    const k = key(original);
    if (k === "") {
      blank++;
      continue;
    }
    const entry = map.get(k);
    if (entry) entry.count++;
    else map.set(k, {original, count: 1});
  }
  return {map, blank};
}

/* Compares two lists. Matching uses the cleaned-up values the person asked
   for, but results always show the values as they were typed. */
export function compareLists(
  a: readonly string[],
  b: readonly string[],
  options: CompareOptions
): CompareResult {
  const key = (value: string) => {
    let k = nfc(value);
    if (options.ignoreSpaces) k = k.trim();
    if (!options.matchCase) k = k.toLowerCase();
    return k;
  };
  const A = group(a, key);
  const B = group(b, key);

  const both: string[] = [];
  const onlyA: string[] = [];
  A.map.forEach((entry, k) =>
    (B.map.has(k) ? both : onlyA).push(entry.original)
  );
  const onlyB: string[] = [];
  B.map.forEach((entry, k) => {
    if (!A.map.has(k)) onlyB.push(entry.original);
  });

  const repeated = (map: Map<string, Entry>) =>
    Array.from(map.values())
      .filter(entry => entry.count > 1)
      .map(entry => ({value: entry.original, count: entry.count}));

  return {
    totalA: a.length,
    totalB: b.length,
    blankA: A.blank,
    blankB: B.blank,
    uniqueA: A.map.size,
    uniqueB: B.map.size,
    both,
    onlyA,
    onlyB,
    repeatedA: repeated(A.map),
    repeatedB: repeated(B.map)
  };
}

export type ResultKey = "both" | "onlyA" | "onlyB" | "repeatedA" | "repeatedB";

export const RESULT_TITLES: Record<ResultKey, string> = {
  both: "In both lists",
  onlyA: "Only in List A",
  onlyB: "Only in List B",
  repeatedA: "Repeated in List A",
  repeatedB: "Repeated in List B"
};
