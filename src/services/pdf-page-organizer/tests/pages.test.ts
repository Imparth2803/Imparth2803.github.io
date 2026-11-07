import {
  describeOrder,
  duplicatePages,
  keysBetween,
  movePages,
  PageItem,
  pagesOf,
  removePages,
  shiftPage,
  turnPages
} from "../logic/pages";

const order = (items: PageItem[]) =>
  items.map(item => `${item.source}:${item.index + 1}`);

describe("page list", () => {
  it("lists a file's pages in order, each with its own key", () => {
    const items = pagesOf(1, 3);
    expect(order(items)).toEqual(["1:1", "1:2", "1:3"]);
    expect(new Set(items.map(i => i.key)).size).toBe(3);
  });

  it("reaches the example order 3, 1, 2, 5 from 1–5", () => {
    let items = pagesOf(1, 5);
    const key = (page: number) => items[page - 1]!.key;
    items = removePages(items, new Set([key(4)]));
    items = movePages(items, new Set([items[2]!.key]), items[0]!.key);
    expect(order(items)).toEqual(["1:3", "1:1", "1:2", "1:5"]);
  });

  it("moves several pages together, keeping their order", () => {
    const items = pagesOf(1, 6);
    const moved = movePages(
      items,
      new Set([items[4]!.key, items[1]!.key]),
      items[0]!.key
    );
    expect(order(moved)).toEqual(["1:2", "1:5", "1:1", "1:3", "1:4", "1:6"]);
    expect(
      order(movePages(items, new Set([items[0]!.key]), null)).slice(-1)
    ).toEqual(["1:1"]);
  });

  it("returns the same list when nothing really moves (no empty Undo step)", () => {
    const items = pagesOf(1, 3);
    expect(movePages(items, new Set([items[1]!.key]), items[2]!.key)).toBe(
      items
    );
    expect(movePages(items, new Set([items[1]!.key]), items[1]!.key)).toBe(
      items
    );
    expect(shiftPage(items, items[0]!.key, -1)).toBe(items);
    expect(shiftPage(items, items[2]!.key, 1)).toBe(items);
  });

  it("shifts one page left or right", () => {
    const items = pagesOf(1, 3);
    expect(order(shiftPage(items, items[0]!.key, 1))).toEqual([
      "1:2",
      "1:1",
      "1:3"
    ]);
    expect(order(shiftPage(items, items[2]!.key, -1))).toEqual([
      "1:1",
      "1:3",
      "1:2"
    ]);
  });

  it("turns pages both ways, wrapping round", () => {
    const items = pagesOf(1, 2);
    const one = new Set([items[0]!.key]);
    expect(turnPages(items, one, -90)[0]!.turn).toBe(270);
    let turned = items;
    for (let i = 0; i < 4; i++) turned = turnPages(turned, one, 90);
    expect(turned[0]!.turn).toBe(0);
    expect(turned[1]!.turn).toBe(0);
  });

  it("duplicates a page straight after itself, with a new key", () => {
    const items = pagesOf(1, 3);
    const out = duplicatePages(items, new Set([items[1]!.key]));
    expect(order(out)).toEqual(["1:1", "1:2", "1:2", "1:3"]);
    expect(out[1]!.key).not.toBe(out[2]!.key);
  });

  it("selects a run of pages either way round", () => {
    const items = pagesOf(1, 5);
    const keys = items.map(i => i.key);
    expect(keysBetween(items, keys[3]!, keys[1]!)).toEqual(keys.slice(1, 4));
    expect(keysBetween(items, "missing", keys[2]!)).toEqual([keys[2]]);
  });

  it("describes the order in words, with ranges and turns", () => {
    let items = [...pagesOf(1, 5), ...pagesOf(2, 2)];
    items = removePages(items, new Set([items[3]!.key]));
    items = movePages(items, new Set([items[2]!.key]), items[0]!.key);
    items = turnPages(items, new Set([items[3]!.key]), 90);
    const name = (s: number) => (s === 1 ? "report.pdf" : "extra.pdf");
    expect(describeOrder(items, name)).toEqual([
      "report.pdf pages 3, 1–2, 5 (turned 90°)",
      "extra.pdf pages 1–2"
    ]);
    expect(describeOrder(pagesOf(2, 1), name)).toEqual(["extra.pdf page 1"]);
  });
});
