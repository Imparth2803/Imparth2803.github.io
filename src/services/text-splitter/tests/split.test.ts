import {parseDelimited} from "../../../shared/tabular/delimited";
import {buildTable, SplitOptions} from "../logic/split";

const base: SplitOptions = {
  layout: "columns",
  header: "auto",
  typedNames: "",
  trim: true
};

describe("Text Splitter", () => {
  it("matches the requirements example with typed column names", () => {
    const rows = parseDelimited(
      "Parth,25,Mumbai\nRahul,28,Pune\nAmit,30,Thane",
      ","
    );
    expect(
      buildTable(rows, {
        ...base,
        header: "typed",
        typedNames: "Name, Age, City"
      })
    ).toEqual({
      header: ["Name", "Age", "City"],
      rows: [
        ["Parth", "25", "Mumbai"],
        ["Rahul", "28", "Pune"],
        ["Amit", "30", "Thane"]
      ]
    });
  });

  it("keeps quoted values together and empty values in place", () => {
    const rows = parseDelimited(
      'Parth,"Mumbai, Maharashtra",\n,28,Pune\nAmit',
      ","
    );
    expect(buildTable(rows, base).rows).toEqual([
      ["Parth", "Mumbai, Maharashtra", ""],
      ["", "28", "Pune"],
      ["Amit", "", ""]
    ]);
  });

  it("uses the first row as names, filling blanks", () => {
    const rows = parseDelimited("Name,,City\nParth,25,Mumbai", ",");
    expect(buildTable(rows, {...base, header: "first-row"})).toEqual({
      header: ["Name", "Column 2", "City"],
      rows: [["Parth", "25", "Mumbai"]]
    });
  });

  it("names missing typed columns automatically", () => {
    const rows = parseDelimited("a;b;c", ";");
    expect(
      buildTable(rows, {...base, header: "typed", typedNames: "First"}).header
    ).toEqual(["First", "Column 2", "Column 3"]);
  });

  it("can put every value on its own line", () => {
    const rows = parseDelimited("a, b,\nc", ",");
    expect(buildTable(rows, {...base, layout: "rows"})).toEqual({
      header: ["Values"],
      rows: [["a"], ["b"], ["c"]]
    });
  });

  it("keeps spaces when trimming is off", () => {
    const rows = parseDelimited(" a , b", ",");
    expect(buildTable(rows, {...base, trim: false}).rows).toEqual([
      [" a ", " b"]
    ]);
  });

  it("treats several spaces as one separator", () => {
    expect(parseDelimited("Parth   25  Mumbai", " ")).toEqual([
      ["Parth", "25", "Mumbai"]
    ]);
  });

  it("splits on separators longer than one character", () => {
    expect(parseDelimited("a::b::c", "::")).toEqual([["a", "b", "c"]]);
  });

  it("works out the separator", () => {
    expect(parseDelimited("a;b;c\nd;e;f", "auto")).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"]
    ]);
  });
});
