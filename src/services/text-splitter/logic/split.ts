import {autoColumnNames, padRows} from "../../../shared/tabular/table";

export type HeaderMode = "first-row" | "auto" | "typed";
export type Layout = "columns" | "rows";

export interface SplitOptions {
  /** "columns": each line becomes a row of columns.
      "rows": every value goes on its own line, in one column. */
  layout: Layout;
  header: HeaderMode;
  /** Column names typed by the person, separated by commas. */
  typedNames: string;
  trim: boolean;
}

export interface SplitResult {
  header: string[];
  rows: string[][];
}

/* Turns rows of separated values (already split by the separator) into a
   table with column names. Short rows are padded so columns never shift. */
export function buildTable(
  parsed: string[][],
  options: SplitOptions
): SplitResult {
  const cleaned = options.trim
    ? parsed.map(row => row.map(cell => cell.trim()))
    : parsed;

  if (options.layout === "rows") {
    const values = cleaned.flat().filter(value => value !== "");
    const name =
      options.header === "typed" ? typedNames(options.typedNames)[0] : "";
    return {header: [name || "Values"], rows: values.map(value => [value])};
  }

  let body = padRows(cleaned);
  const width = body[0]?.length ?? 0;
  const fallback = autoColumnNames(width);
  let header: string[];
  if (options.header === "first-row") {
    const first = body[0] ?? [];
    body = body.slice(1);
    header = fallback.map((name, i) => first[i]?.trim() || name);
  } else if (options.header === "typed") {
    const names = typedNames(options.typedNames);
    header = fallback.map((name, i) => names[i] || name);
  } else {
    header = fallback;
  }
  return {header, rows: body};
}

/* "Name, Age, City" -> ["Name", "Age", "City"]. */
export function typedNames(text: string): string[] {
  return text.split(",").map(name => name.trim());
}
