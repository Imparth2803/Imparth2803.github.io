import {cleanList, CleanOptions, sortValues} from "../logic/cleanList";

const off: CleanOptions = {
  trim: false,
  collapseSpaces: false,
  removeSpecial: false,
  removeNumbers: false,
  removeLetters: false,
  letterCase: "keep",
  blockedWords: [],
  minLength: null,
  maxLength: null,
  removeEmpty: false,
  removeDuplicates: false,
  ignoreCase: false,
  sort: "none"
};

describe("List Cleaner", () => {
  it("matches the requirements example", () => {
    const input = ["Parth", "Rahul", "", "Parth", "AMIT", " Rahul"];
    const result = cleanList(input, {
      ...off,
      trim: true,
      removeEmpty: true,
      removeDuplicates: true,
      ignoreCase: true,
      sort: "az"
    });
    expect(result.kept).toEqual(["AMIT", "Parth", "Rahul"]);
    expect(input).toHaveLength(6);
    expect(result.removed.map(r => [r.line, r.reason])).toEqual([
      [3, "empty"],
      [4, "duplicate"],
      [6, "duplicate"]
    ]);
  });

  it("keeps the original order when sorting is off", () => {
    expect(
      cleanList(["c", "a", "b", "a"], {...off, removeDuplicates: true}).kept
    ).toEqual(["c", "a", "b"]);
  });

  it("treats different letter case as different unless asked", () => {
    expect(
      cleanList(["Parth", "PARTH"], {...off, removeDuplicates: true}).kept
    ).toEqual(["Parth", "PARTH"]);
  });

  it("collapses spaces and tidies up after removing characters", () => {
    const result = cleanList(["  A  -  B  ", "x@y.com", "Flat 12B"], {
      ...off,
      trim: true,
      collapseSpaces: true,
      removeSpecial: true
    });
    expect(result.kept).toEqual(["A B", "xycom", "Flat 12B"]);
  });

  it("removes numbers or letters, keeping non-English letters", () => {
    expect(
      cleanList(["Room 101", "Café 9"], {
        ...off,
        trim: true,
        removeNumbers: true
      }).kept
    ).toEqual(["Room", "Café"]);
    expect(
      cleanList(["Room 101"], {...off, trim: true, removeLetters: true}).kept
    ).toEqual(["101"]);
  });

  it("changes letter case before removing repeats", () => {
    const result = cleanList(["parth tawde", "PARTH TAWDE"], {
      ...off,
      letterCase: "title",
      removeDuplicates: true
    });
    expect(result.kept).toEqual(["Parth Tawde"]);
  });

  it("filters by word and length", () => {
    const result = cleanList(["test user", "Al", "Parth", "Alexander"], {
      ...off,
      blockedWords: [" TEST ", ""],
      minLength: 3,
      maxLength: 8
    });
    expect(result.kept).toEqual(["Parth"]);
    expect(result.removed.map(r => r.reason)).toEqual([
      "word",
      "short",
      "long"
    ]);
  });

  it("treats the same letter typed two ways as one", () => {
    const composed = "Café";
    const decomposed = "Café";
    expect(
      cleanList([composed, decomposed], {...off, removeDuplicates: true}).kept
    ).toEqual([composed]);
  });

  it("sorts names and numbers sensibly", () => {
    expect(
      sortValues(["item 10", "Item 2", "apple", "Émile", "zebra"], "az")
    ).toEqual(["apple", "Émile", "Item 2", "item 10", "zebra"]);
    expect(
      sortValues(["10", "n/a", "2", "1,250", "-3"], "small-large")
    ).toEqual(["-3", "2", "10", "1,250", "n/a"]);
    expect(sortValues(["10", "2"], "large-small")).toEqual(["10", "2"]);
  });
});
