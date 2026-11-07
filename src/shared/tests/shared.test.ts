import {decodeText} from "../files/decodeText";
import {toDelimited} from "../tabular/delimited";
import {readSource, readText} from "../tabular/source";
import {columnLabels, padRows} from "../tabular/table";
import {readWorkbook, writeWorkbook} from "../tabular/xlsx";
import {changeCase, toTitleCase} from "../text/letterCase";

describe("reading text files", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);

  it("reads UTF-8 with and without a byte-order mark", () => {
    const utf8 = Array.from(new TextEncoder().encode("Café"));
    expect(decodeText(bytes(...utf8)).text).toBe("Café");
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, ...utf8))).toEqual({
      text: "Café"
    });
  });

  it("falls back to Windows-1252 and says so", () => {
    const result = decodeText(bytes(0x43, 0x61, 0x66, 0xe9)); // "Café" in Windows-1252
    expect(result.text).toBe("Café");
    expect(result.notice).toMatch(/Windows-1252/);
  });

  it("reads UTF-16 (Excel's Unicode Text)", () => {
    expect(decodeText(bytes(0xff, 0xfe, 0x41, 0x00, 0x42, 0x00)).text).toBe(
      "AB"
    );
  });

  it("refuses binary files with a clear message", () => {
    const binary = new Uint8Array(200).map((_, i) => i % 8);
    expect(() => decodeText(binary)).toThrow(/doesn't look like a text file/);
  });
});

describe("tables", () => {
  it("pads short rows so columns don't shift", () => {
    expect(padRows([["a", "b"], ["c"]])).toEqual([
      ["a", "b"],
      ["c", ""]
    ]);
  });

  it("labels columns from the first row or by number", () => {
    expect(columnLabels(["Name", " "], 3, true)).toEqual([
      "Name",
      "Column 2",
      "Column 3"
    ]);
    expect(columnLabels(["Name"], 2, false)).toEqual(["Column 1", "Column 2"]);
  });

  it("quotes values that contain separators when saving", () => {
    expect(toDelimited([["a,b", 'say "hi"', "x"]], ",")).toBe(
      '"a,b","say ""hi""",x'
    );
  });
});

describe("reading input", () => {
  it("reads pasted lists line by line, ignoring the final line break", async () => {
    const loaded = await readSource(
      {kind: "text", text: "a\r\nb\n\nc\n"},
      {split: "lines", maxRows: 10}
    );
    expect(loaded.sheets[0]!.rows).toEqual([["a"], ["b"], [""], ["c"]]);
  });

  it("explains empty input and inputs over the row limit", async () => {
    await expect(
      readSource({kind: "text", text: ""}, {split: "lines", maxRows: 10})
    ).rejects.toThrow(/nothing to work with/);
    await expect(
      readSource({kind: "text", text: "1\n2\n3"}, {split: "lines", maxRows: 2})
    ).rejects.toThrow(/up to 2 at a time/);
  });
});

describe("reading plain text", () => {
  it("returns the text and refuses empty or over-long input", async () => {
    expect((await readText({kind: "text", text: "a\nb"}, 5)).text).toBe("a\nb");
    await expect(readText({kind: "text", text: "  \n "}, 5)).rejects.toThrow(
      /nothing to work with/
    );
    await expect(readText({kind: "text", text: "1\n2\n3"}, 2)).rejects.toThrow(
      /up to 2 at a time/
    );
  });

  it("uses a chosen encoding", () => {
    const bytes = new Uint8Array([0xc8, 0xe5, 0xf0]); // Cyrillic in Windows-1251
    expect(decodeText(bytes, "windows-1251").text).toBe("Иер");
    expect(
      decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]), "utf-8").text
    ).toBe("A");
  });
});

describe("Excel files", () => {
  it("keeps leading zeros and long numbers exactly", async () => {
    const rows = [
      ["Employee ID", "Phone", "PIN"],
      ["007", "9876543210123456789", "400001"]
    ];
    const blob = await writeWorkbook([{name: "People", rows}]);
    const buffer = await new Response(blob).arrayBuffer().catch(() => null);
    // jsdom's Blob can't always be read back; fall back to FileReader.
    const bytes = buffer ?? (await readBlob(blob));
    const sheets = await readWorkbook(bytes);
    expect(sheets).toEqual([{name: "People", rows}]);
  });

  it("reads numbers stored as numbers without rounding", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([[123456789012, 0.1, 42]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, "Numbers");
    const data: ArrayBuffer = XLSX.write(book, {
      type: "array",
      bookType: "xlsx"
    });
    const sheets = await readWorkbook(data);
    expect(sheets[0]!.rows).toEqual([["123456789012", "0.1", "42"]]);
  });

  it("can read date cells as exact dates for the date tool", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([[46333, 46333.5, 0.75, 7]]);
    ws["A1"]!.z = "m/d/yy";
    ws["B1"]!.z = "dd/mm/yyyy hh:mm";
    ws["C1"]!.z = "h:mm AM/PM";
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, "Dates");
    const data: ArrayBuffer = XLSX.write(book, {
      type: "array",
      bookType: "xlsx"
    });
    expect((await readWorkbook(data, "iso"))[0]!.rows).toEqual([
      ["2026-11-07", "2026-11-07 12:00:00", "18:00:00", "7"]
    ]);
    expect((await readWorkbook(data))[0]!.rows[0]![0]).toBe("11/7/26");
  });

  it("explains files that aren't spreadsheets", async () => {
    await expect(
      readWorkbook(new Uint8Array([1, 2, 3, 4]).buffer)
    ).rejects.toThrow(/couldn't be opened/);
  });
});

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("letter case", () => {
  it("follows the written Title Case rules", () => {
    expect(toTitleCase("   PARTH    TAWDE")).toBe("   Parth    Tawde");
    expect(toTitleCase("the lord of the rings")).toBe("The Lord of the Rings");
    expect(toTitleCase("report from NASA and the HR team")).toBe(
      "Report From NASA and the HR Team"
    );
    expect(toTitleCase("jean-luc o'neil")).toBe("Jean-Luc O'neil");
    expect(toTitleCase("(hello) world")).toBe("(Hello) World");
  });

  it("changes case the same way on every computer", () => {
    expect(changeCase("istanbul", "upper")).toBe("ISTANBUL");
    expect(changeCase("ÉCOLE", "lower")).toBe("école");
    expect(changeCase("Mixed", "keep")).toBe("Mixed");
  });
});
