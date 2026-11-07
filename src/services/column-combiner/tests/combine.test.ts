import {combine, CombineOptions, PRESETS} from "../logic/combine";

const rows = [
  ["Parth", "Tawde"],
  ["Rahul", "Sharma"]
];
const base: CombineOptions = {
  columns: [0, 1],
  betweenColumns: " ",
  betweenValues: ", ",
  quote: "",
  prefix: "",
  suffix: "",
  skipBlank: true,
  unique: false,
  fromRow: null,
  toRow: null
};
const preset = (id: string) => PRESETS.find(p => p.id === id)!.settings;

describe("Column Combiner", () => {
  it("matches the requirements example", () => {
    expect(combine(rows, base).text).toBe("Parth Tawde, Rahul Sharma");
  });

  it("builds an SQL IN list, doubling quotes inside values", () => {
    const names = [["Parth"], ["Rahul"], ["O'Brien"]];
    expect(combine(names, {...base, columns: [0], ...preset("sql")}).text).toBe(
      "('Parth', 'Rahul', 'O''Brien')"
    );
  });

  it("builds email and quoted CSV lists", () => {
    const emails = [["parth@example.com"], ["rahul@example.com"]];
    expect(
      combine(emails, {...base, columns: [0], ...preset("email")}).text
    ).toBe("parth@example.com; rahul@example.com");
    expect(
      combine([["Parth"], ["Rahul"]], {...base, columns: [0], ...preset("csv")})
        .text
    ).toBe('"Parth","Rahul"');
  });

  it("leaves out empty cells without doubling separators", () => {
    const data = [
      ["Parth", "", "Tawde"],
      ["", "", ""],
      ["Amit", "K", ""]
    ];
    const result = combine(data, {...base, columns: [0, 1, 2]});
    expect(result.text).toBe("Parth Tawde, Amit K");
    expect(result.skippedBlank).toBe(1);
  });

  it("keeps empty values when asked", () => {
    expect(
      combine([["a"], [""], ["b"]], {...base, columns: [0], skipBlank: false})
        .text
    ).toBe("a, , b");
  });

  it("removes repeats and respects the row range", () => {
    const data = [["a"], ["b"], ["a"], ["c"], ["d"]];
    const result = combine(data, {
      ...base,
      columns: [0],
      unique: true,
      fromRow: 1,
      toRow: 4
    });
    expect(result.text).toBe("a, b, c");
    expect(result.skippedDuplicate).toBe(1);
    expect(result.rowsUsed).toBe(4);
  });

  it("adds a prefix and suffix", () => {
    expect(
      combine(rows, {...base, columns: [0], prefix: "[", suffix: "]"}).text
    ).toBe("[Parth, Rahul]");
  });
});
