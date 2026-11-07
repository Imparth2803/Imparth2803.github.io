import {UserError} from "../text/userError";
import {LoadedSource, ReadOptions, readSourceCached, Source} from "./source";
import {columnCount} from "./table";

const FIRST_ROWS = 6;
const CELL_PREVIEW_CHARS = 120;

export interface SheetSummary {
  name: string;
  rowCount: number;
  columnCount: number;
  /** The first few rows (cells shortened), to name and preview columns. */
  firstRows: string[][];
}

export interface InspectResult {
  sheets: SheetSummary[];
  notice?: string;
  /** The separator found automatically in text input. */
  separator?: string;
}

/* A light summary of a source for the page: sheet names, sizes and the
   first rows. The full data stays in the worker. */
export async function inspectSource(
  source: Source,
  read: ReadOptions
): Promise<InspectResult> {
  const loaded = await readSourceCached(source, read);
  return {
    notice: loaded.notice,
    separator: loaded.separator,
    sheets: loaded.sheets.map(sheet => ({
      name: sheet.name,
      rowCount: sheet.rows.length,
      columnCount: columnCount(sheet.rows),
      firstRows: sheet.rows
        .slice(0, FIRST_ROWS)
        .map(row => row.map(cell => cell.slice(0, CELL_PREVIEW_CHARS)))
    }))
  };
}

/** Which sheet of an input to use, and whether its first row is column names. */
export interface SheetPick {
  source: Source;
  read: ReadOptions;
  sheet: number;
  hasHeader: boolean;
}

/** One column of a sheet (a list). */
export interface ColumnPick extends SheetPick {
  column: number;
}

/* The chosen sheet, split into its header row (if any) and data rows. */
export async function readTable(
  pick: SheetPick
): Promise<{header: string[] | null; rows: string[][]}> {
  const loaded: LoadedSource = await readSourceCached(pick.source, pick.read);
  const sheet = loaded.sheets[pick.sheet];
  if (!sheet) {
    throw new UserError(
      "That sheet can't be found any more. Open the file again."
    );
  }
  return pick.hasHeader
    ? {header: sheet.rows[0] ?? [], rows: sheet.rows.slice(1)}
    : {header: null, rows: sheet.rows};
}

/* All data rows of the chosen sheet. */
export async function readRows(pick: SheetPick): Promise<string[][]> {
  return (await readTable(pick)).rows;
}

/* The values of one column (leaving out the header row when there is one). */
export async function readColumn(pick: ColumnPick): Promise<string[]> {
  const rows = await readRows(pick);
  return rows.map(row => row[pick.column] ?? "");
}
