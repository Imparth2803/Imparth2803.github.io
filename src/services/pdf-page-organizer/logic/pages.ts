/* The page list: which page of which PDF goes where, and how far it is
   turned. Every change returns a new list, so the page can offer Undo. */

export type Turn = 0 | 90 | 180 | 270;

export interface PageItem {
  /** Unique for this item, even when a page is copied. */
  key: string;
  /** Which PDF the page comes from. */
  source: number;
  /** Page index in that PDF, from 0. */
  index: number;
  /** Extra turn clockwise, on top of how the page is already turned. */
  turn: Turn;
}

let nextKey = 1;
const newKey = () => `p${nextKey++}`;

export function pagesOf(source: number, pageCount: number): PageItem[] {
  return Array.from({length: pageCount}, (_, index) => ({
    key: newKey(),
    source,
    index,
    turn: 0
  }));
}

/** Moves the given pages (kept in their current order) to sit before
    `beforeKey`, or to the end when it's null. */
export function movePages(
  items: PageItem[],
  keys: ReadonlySet<string>,
  beforeKey: string | null
): PageItem[] {
  if (beforeKey !== null && keys.has(beforeKey)) return items;
  const moving = items.filter(item => keys.has(item.key));
  const rest = items.filter(item => !keys.has(item.key));
  const at =
    beforeKey === null
      ? rest.length
      : rest.findIndex(item => item.key === beforeKey);
  if (at === -1) return items;
  const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  return next.every((item, i) => item === items[i]) ? items : next;
}

/** Moves one page one place left (-1) or right (+1). */
export function shiftPage(
  items: PageItem[],
  key: string,
  by: -1 | 1
): PageItem[] {
  const from = items.findIndex(item => item.key === key);
  const to = from + by;
  if (from === -1 || to < 0 || to >= items.length) return items;
  const next = items.slice();
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function turnPages(
  items: PageItem[],
  keys: ReadonlySet<string>,
  degrees: 90 | -90
): PageItem[] {
  return items.map(item =>
    keys.has(item.key)
      ? {...item, turn: ((item.turn + degrees + 360) % 360) as Turn}
      : item
  );
}

export function removePages(
  items: PageItem[],
  keys: ReadonlySet<string>
): PageItem[] {
  return items.filter(item => !keys.has(item.key));
}

/** Puts a copy of each page straight after it. */
export function duplicatePages(
  items: PageItem[],
  keys: ReadonlySet<string>
): PageItem[] {
  return items.flatMap(item =>
    keys.has(item.key) ? [item, {...item, key: newKey()}] : [item]
  );
}

/** The keys from one page to another (inclusive), for Shift-click. */
export function keysBetween(
  items: PageItem[],
  fromKey: string,
  toKey: string
): string[] {
  const a = items.findIndex(item => item.key === fromKey);
  const b = items.findIndex(item => item.key === toKey);
  if (a === -1 || b === -1) return [toKey];
  return items.slice(Math.min(a, b), Math.max(a, b) + 1).map(item => item.key);
}

/** A short, readable description of the order, e.g.
    "report.pdf pages 3, 1–2, 5 (page 5 turned 90°)". Runs of pages that
    follow each other in the same file are shown as ranges. */
export function describeOrder(
  items: PageItem[],
  sourceName: (source: number) => string
): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < items.length) {
    const source = items[i]!.source;
    const runs: string[] = [];
    while (i < items.length && items[i]!.source === source) {
      const start = items[i]!;
      let end = start;
      while (
        i + 1 < items.length &&
        items[i + 1]!.source === source &&
        items[i + 1]!.index === end.index + 1 &&
        items[i + 1]!.turn === start.turn
      ) {
        i++;
        end = items[i]!;
      }
      const range =
        start === end
          ? `${start.index + 1}`
          : `${start.index + 1}–${end.index + 1}`;
      runs.push(start.turn ? `${range} (turned ${start.turn}°)` : range);
      i++;
    }
    const single = runs.length === 1 && !/[–,]/.test(runs[0]!);
    parts.push(
      `${sourceName(source)} ${single ? "page" : "pages"} ${runs.join(", ")}`
    );
  }
  return parts;
}
