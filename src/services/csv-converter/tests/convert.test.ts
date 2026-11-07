import {
  inspectValues,
  isLongNumber,
  isRisky,
  pickColumns,
  protect
} from "../logic/convert";

describe("CSV Converter", () => {
  it("protects values that could run as formulas, but not plain numbers", () => {
    expect(protect("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(protect("@cmd")).toBe("'@cmd");
    expect(protect("+44 20 7946 0000")).toBe("'+44 20 7946 0000");
    expect(protect("-5")).toBe("-5");
    expect(protect("+12.5")).toBe("+12.5");
    expect(protect("Parth")).toBe("Parth");
    expect(isRisky("\t=1")).toBe(true);
  });

  it("spots numbers longer than 15 digits", () => {
    expect(isLongNumber("9876543210123456789")).toBe(true);
    expect(isLongNumber("123456789012345")).toBe(false);
    expect(isLongNumber("0000000000000000123")).toBe(false); // leading zeros don't count
    expect(isLongNumber("1234567890.1234567")).toBe(true);
    expect(isLongNumber("ABC1234567890123456")).toBe(false);
  });

  it("reports findings with the first example", () => {
    expect(
      inspectValues([
        ["007", "=1+1"],
        ["9876543210123456789", "x"]
      ])
    ).toEqual({
      longNumbers: 1,
      longNumberExample: {row: 2, column: 0, value: "9876543210123456789"},
      risky: 1
    });
  });

  it("keeps only the chosen columns, in order", () => {
    expect(pickColumns([["a", "b", "c"], ["d"]], [0, 2])).toEqual([
      ["a", "c"],
      ["d", ""]
    ]);
  });
});
