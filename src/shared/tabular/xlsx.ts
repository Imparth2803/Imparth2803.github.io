import type {CellObject, WorkBook, WorkSheet} from "xlsx";
import {UserError} from "../text/userError";
import type {Sheet} from "./table";

const DAMAGED =
  "This spreadsheet couldn't be opened. It may be damaged, password-protected, or not really an Excel file. Open it in Excel, save a new copy and try again.";

/* .xlsx and .ods files are ZIP archives ("PK"); old .xls files start with
   the Office signature D0 CF 11 E0. Anything else is damaged or renamed,
   and SheetJS would otherwise read it as text. */
function looksLikeSpreadsheet(head: Uint8Array): boolean {
  const zip = head[0] === 0x50 && head[1] === 0x4b;
  const ole =
    head[0] === 0xd0 &&
    head[1] === 0xcf &&
    head[2] === 0x11 &&
    head[3] === 0xe0;
  return zip || ole;
}

/* SheetJS is large, so it is only loaded when a spreadsheet is opened or
   saved. */
function loadSheetJs() {
  return import("xlsx");
}

/* Reads every sheet of an Excel file as text, the way Excel shows it:
   numbers keep every digit (so long IDs stay intact) and dates, percentages
   and currency use the cell's own format. */
export type ExcelDates = "shown" | "iso";

export async function readWorkbook(
  bytes: ArrayBuffer,
  dates: ExcelDates = "shown"
): Promise<Sheet[]> {
  if (
    !looksLikeSpreadsheet(
      new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength))
    )
  ) {
    throw new UserError(DAMAGED);
  }
  const XLSX = await loadSheetJs();
  let book: WorkBook;
  try {
    book = XLSX.read(bytes, {
      type: "array",
      cellNF: true,
      cellText: true,
      dense: false
    });
  } catch {
    throw new UserError(DAMAGED);
  }
  const date1904 = Boolean(book.Workbook?.WBProps?.date1904);
  const text = (cell: CellObject | undefined) =>
    dates === "iso"
      ? isoDateText(XLSX.SSF, cell, date1904) ?? cellText(cell)
      : cellText(cell);
  return book.SheetNames.map(name => ({
    name,
    rows: sheetRows(XLSX.utils, book.Sheets[name], text)
  }));
}

type SheetUtils = typeof import("xlsx")["utils"];

function sheetRows(
  utils: SheetUtils,
  sheet: WorkSheet | undefined,
  text: (cell: CellObject | undefined) => string
): string[][] {
  const ref = sheet?.["!ref"];
  if (!sheet || !ref) return [];
  const range = utils.decode_range(ref);
  const rows: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      row.push(
        text(sheet[utils.encode_cell({r, c})] as CellObject | undefined)
      );
    }
    rows.push(row);
  }
  // Drop trailing rows that are completely empty (formatting-only rows).
  while (rows.length > 0 && rows[rows.length - 1]!.every(cell => cell === "")) {
    rows.pop();
  }
  return rows;
}

/* A date-formatted number cell as "YYYY-MM-DD" (plus " HH:MM:SS" when it
   has a time), so date tools read the exact date, not a display format
   like 11/7/26. Other cells: null. */
function isoDateText(
  ssf: typeof import("xlsx")["SSF"],
  cell: CellObject | undefined,
  date1904: boolean
): string | null {
  if (!cell || cell.t !== "n" || typeof cell.v !== "number" || !cell.z)
    return null;
  if (!ssf.is_date(cell.z)) return null;
  const p = ssf.parse_date_code(cell.v, {date1904});
  if (!p) return null;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const date = `${pad(p.y, 4)}-${pad(p.m)}-${pad(p.d)}`;
  const time = `${pad(p.H)}:${pad(p.M)}:${pad(p.S)}`;
  if (cell.v >= 0 && cell.v < 1) return time; // a time on its own
  return cell.v % 1 !== 0 ? `${date} ${time}` : date;
}

function cellText(cell: CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  switch (cell.t) {
    case "s":
      return String(cell.v);
    case "n":
      // "General" numbers: every digit, never 1.23E+11. Formatted numbers
      // (dates, %, currency): the text Excel shows.
      return !cell.z || cell.z === "General"
        ? String(cell.v)
        : cell.w ?? String(cell.v);
    case "b":
      return cell.v ? "TRUE" : "FALSE";
    default:
      return cell.w ?? String(cell.v);
  }
}

/* Builds an .xlsx file. Every cell is saved as text, so leading zeros and
   long numbers stay exactly as they are. */
export async function writeWorkbook(sheets: Sheet[]): Promise<Blob> {
  const XLSX = await loadSheetJs();
  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows.length ? sheet.rows : [[""]]);
    // aoa_to_sheet already stores strings as text cells ("s").
    XLSX.utils.book_append_sheet(book, ws, uniqueSheetName(sheet.name, used));
  }
  const data = XLSX.write(book, {
    type: "array",
    bookType: "xlsx",
    compression: true
  });
  return new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

/* Excel sheet names: at most 31 characters, no : \ / ? * [ ], unique. */
function uniqueSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[:\\/?*[\]]/g, " ").trim() || "Sheet").slice(
    0,
    31
  );
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
