import {compareLists} from "../logic/compare";

describe("Two-List Comparator", () => {
  it("matches the requirements example", () => {
    const r = compareLists(
      ["Parth", "Rahul", "Amit", "Sneha"],
      ["Parth", "Rahul", "Priya"],
      {
        matchCase: false,
        ignoreSpaces: true
      }
    );
    expect(r.both).toEqual(["Parth", "Rahul"]);
    expect(r.onlyA).toEqual(["Amit", "Sneha"]);
    expect(r.onlyB).toEqual(["Priya"]);
  });

  it("matches on cleaned values but shows the originals", () => {
    const r = compareLists([" PARTH "], ["parth"], {
      matchCase: false,
      ignoreSpaces: true
    });
    expect(r.both).toEqual([" PARTH "]);
    const strict = compareLists([" PARTH "], ["parth"], {
      matchCase: true,
      ignoreSpaces: false
    });
    expect(strict.both).toEqual([]);
    expect(strict.onlyA).toEqual([" PARTH "]);
  });

  it("counts repeats within each list and ignores blanks", () => {
    const r = compareLists(["a", "A", "b", "", "  "], ["c", "c", "c"], {
      matchCase: false,
      ignoreSpaces: true
    });
    expect(r.repeatedA).toEqual([{value: "a", count: 2}]);
    expect(r.repeatedB).toEqual([{value: "c", count: 3}]);
    expect(r.blankA).toBe(2);
    expect(r.totalA).toBe(5);
    expect(r.uniqueA).toBe(2);
  });

  it("handles 100,000 entries quickly", () => {
    const a = Array.from({length: 100000}, (_, i) => `ID${i}`);
    const b = Array.from({length: 100000}, (_, i) => `id${i + 50000}`);
    const started = Date.now();
    const r = compareLists(a, b, {matchCase: false, ignoreSpaces: true});
    expect(r.both).toHaveLength(50000);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
