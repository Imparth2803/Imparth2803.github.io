import Papa from "papaparse";
import {UserError} from "../text/userError";

/** A separator character, or "auto" to detect comma, tab, pipe or semicolon. */
export type SeparatorChoice = string;

export const SEPARATOR_OPTIONS = [
  {value: ",", label: "Comma ( , )"},
  {value: ";", label: "Semicolon ( ; )"},
  {value: "|", label: "Pipe ( | )"},
  {value: "\t", label: "Tab"},
  {value: " ", label: "Space"}
] as const;

/* Splits separated text into rows of cells. Values in double quotes may
   contain the separator ("Mumbai, Maharashtra") and line breaks. Rows keep
   their empty cells so columns never shift. Completely empty lines are
   dropped. */
export function parseDelimited(
  text: string,
  separator: SeparatorChoice
): string[][] {
  if (separator === "") {
    throw new UserError("Type the separator to split on.");
  }
  const result = Papa.parse<string[]>(text, {
    delimiter: separator === "auto" ? "" : separator,
    skipEmptyLines: true,
    header: false,
    dynamicTyping: false
  });
  let rows = result.data;
  if (separator === " ") {
    // Several spaces in a row count as one separator.
    rows = rows.map(row => row.filter(cell => cell !== ""));
  }
  return rows;
}

/* The separator "auto" would pick for this text (comma when unsure). */
export function detectSeparator(text: string): string {
  return (
    Papa.parse(text.slice(0, 64 * 1024), {delimiter: "", preview: 50}).meta
      .delimiter || ","
  );
}

export const SEPARATOR_NAMES: Record<string, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
  "|": "pipe",
  " ": "space"
};

/* Turns rows into CSV/TSV text. Values containing the separator, quotes or
   line breaks are quoted, so the file opens with the same columns. */
export function toDelimited(rows: string[][], separator: string): string {
  return Papa.unparse(rows, {delimiter: separator, newline: "\r\n"});
}
