import {nfc} from "../../../shared/text/normalize";

export type QuoteStyle = "" | "'" | '"';

export interface CombineOptions {
  /** Columns to join in each row, in this order (0-based). */
  columns: number[];
  /** Goes between the chosen columns within a row (e.g. " " for "Parth Tawde"). */
  betweenColumns: string;
  /** Goes between the combined values of each row (e.g. ", "). */
  betweenValues: string;
  /** Wraps each combined value; quotes inside the value are doubled. */
  quote: QuoteStyle;
  prefix: string;
  suffix: string;
  skipBlank: boolean;
  unique: boolean;
  /** 1-based, inclusive, counted among data rows. Empty means from the start / to the end. */
  fromRow: number | null;
  toRow: number | null;
}

export interface CombineResult {
  text: string;
  valueCount: number;
  rowsUsed: number;
  skippedBlank: number;
  skippedDuplicate: number;
}

/* Joins the chosen columns of each row, then joins the rows into one piece
   of text. Empty cells inside a row are left out, so no doubled separators
   appear ("Parth  Tawde" or "Parth, , Tawde"). */
export function combine(
  rows: string[][],
  options: CombineOptions
): CombineResult {
  const start = Math.max(1, options.fromRow ?? 1) - 1;
  const end = Math.min(rows.length, options.toRow ?? rows.length);
  const selected = rows.slice(start, Math.max(start, end));

  const values: string[] = [];
  const seen = new Set<string>();
  let skippedBlank = 0;
  let skippedDuplicate = 0;

  for (const row of selected) {
    const value = nfc(
      options.columns
        .map(i => (row[i] ?? "").trim())
        .filter(cell => cell !== "")
        .join(options.betweenColumns)
    );
    if (value === "" && options.skipBlank) {
      skippedBlank++;
      continue;
    }
    if (options.unique) {
      if (seen.has(value)) {
        skippedDuplicate++;
        continue;
      }
      seen.add(value);
    }
    values.push(quoteValue(value, options.quote));
  }

  return {
    text: options.prefix + values.join(options.betweenValues) + options.suffix,
    valueCount: values.length,
    rowsUsed: selected.length,
    skippedBlank,
    skippedDuplicate
  };
}

function quoteValue(value: string, quote: QuoteStyle): string {
  if (!quote) return value;
  return quote + value.split(quote).join(quote + quote) + quote;
}

export interface Preset {
  id: string;
  label: string;
  example: string;
  settings: Pick<
    CombineOptions,
    "betweenValues" | "quote" | "prefix" | "suffix"
  >;
}

export const PRESETS: Preset[] = [
  {
    id: "list",
    label: "Comma-separated list",
    example: "Parth, Rahul",
    settings: {betweenValues: ", ", quote: "", prefix: "", suffix: ""}
  },
  {
    id: "sql",
    label: "SQL IN list",
    example: "('Parth', 'Rahul')",
    settings: {betweenValues: ", ", quote: "'", prefix: "(", suffix: ")"}
  },
  {
    id: "email",
    label: "Email list",
    example: "parth@example.com; rahul@example.com",
    settings: {betweenValues: "; ", quote: "", prefix: "", suffix: ""}
  },
  {
    id: "csv",
    label: "Quoted CSV",
    example: '"Parth","Rahul"',
    settings: {betweenValues: ",", quote: '"', prefix: "", suffix: ""}
  },
  {
    id: "lines",
    label: "One per line",
    example: "Parth\nRahul",
    settings: {betweenValues: "\n", quote: "", prefix: "", suffix: ""}
  }
];
