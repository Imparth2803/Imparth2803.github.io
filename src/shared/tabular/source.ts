import {decodeText, DecodedText, EncodingChoice} from "../files/decodeText";
import {fileExtension, isSpreadsheetFile} from "../files/fileTypes";
import {splitLines, withoutTrailingEmptyLine} from "../text/normalize";
import {UserError} from "../text/userError";
import {detectSeparator, parseDelimited, SeparatorChoice} from "./delimited";
import type {Sheet} from "./table";
import {ExcelDates, readWorkbook} from "./xlsx";
import {formatCount} from "../text/numbers";

/** What the person gave a tool: pasted text or a file from their device. */
export type Source = {kind: "text"; text: string} | {kind: "file"; file: File};

/** How text is turned into rows: one value per line, or split on a separator. */
export type TextSplit = "lines" | SeparatorChoice;

/* How a list input is split into rows: spreadsheets and CSV files by their
   columns, pasted text and .txt files one entry per line. */
export function listSplit(source: Source | null): TextSplit {
  if (!source || source.kind === "text") return "lines";
  return /\.txt$/i.test(source.file.name) ? "lines" : "auto";
}

export interface LoadedSource {
  sheets: Sheet[];
  /** A plain-language note about how the input was read, if any. */
  notice?: string;
  /** The separator found when text was split with "auto". */
  separator?: string;
}

/** How to read an input. */
export interface ReadOptions {
  split: TextSplit;
  maxRows: number;
  /** For text files: which encoding to use ("auto" detects). */
  encoding?: EncodingChoice;
  /** For spreadsheets: date cells as Excel shows them, or as exact
      YYYY-MM-DD (HH:MM:SS) values for date tools. */
  excelDates?: ExcelDates;
}

/* Pasted text, or a text file's contents. Throws a plain message if empty or
   longer than the line limit. */
export async function readText(
  source: Source,
  maxLines: number,
  encoding: EncodingChoice = "auto"
): Promise<DecodedText> {
  const decoded =
    source.kind === "text"
      ? {text: source.text}
      : decodeText(new Uint8Array(await source.file.arrayBuffer()), encoding);
  if (decoded.text.trim() === "") throw new UserError(emptyMessage(source));
  const lines = withoutTrailingEmptyLine(splitLines(decoded.text)).length;
  if (lines > maxLines) throw new UserError(tooManyMessage(lines, maxLines));
  return decoded;
}

/* Reads pasted text, a text/CSV file or a spreadsheet into sheets of rows.
   Spreadsheets keep their sheets; text becomes one sheet. */
export async function readSource(
  source: Source,
  options: ReadOptions
): Promise<LoadedSource> {
  const {split, maxRows} = options;
  let loaded: LoadedSource;
  if (source.kind === "file" && isSpreadsheetFile(source.file.name)) {
    loaded = {
      sheets: await readWorkbook(
        await source.file.arrayBuffer(),
        options.excelDates ?? "shown"
      )
    };
  } else {
    const decoded =
      source.kind === "text"
        ? {text: source.text}
        : decodeText(
            new Uint8Array(await source.file.arrayBuffer()),
            options.encoding
          );
    // "auto": find the separator once, then split with it, so what's
    // reported is exactly what was used.
    const separator =
      split === "auto" ? detectSeparator(decoded.text) : undefined;
    const rows =
      split === "lines"
        ? withoutTrailingEmptyLine(splitLines(decoded.text)).map(line => [line])
        : parseDelimited(decoded.text, separator ?? split);
    const name =
      source.kind === "file"
        ? source.file.name.slice(
            0,
            -fileExtension(source.file.name).length - 1
          ) || "Sheet1"
        : "Pasted text";
    loaded = {
      sheets: [{name, rows}],
      notice: decoded.notice,
      separator
    };
  }

  if (loaded.sheets.every(sheet => sheet.rows.length === 0)) {
    throw new UserError(emptyMessage(source));
  }
  const largest = Math.max(...loaded.sheets.map(sheet => sheet.rows.length));
  if (largest > maxRows) throw new UserError(tooManyMessage(largest, maxRows));
  return loaded;
}

function emptyMessage(source: Source): string {
  return source.kind === "text"
    ? "There's nothing to work with yet. Paste some text first."
    : "This file is empty. Check that you picked the right file.";
}

function tooManyMessage(count: number, max: number): string {
  return `This has ${formatCount(
    count
  )} rows, but this tool handles up to ${formatCount(
    max
  )} at a time. Split it into smaller parts and do each one separately.`;
}

/* The worker keeps the last two things it read (two, for tools that take
   two lists), so changing a setting doesn't re-read a large file. Pasted
   text is compared by value, files by name, size and modified time. */
interface CacheEntry {
  key: string;
  text?: string;
  loaded: Promise<LoadedSource>;
}
let cache: CacheEntry[] = [];

export function readSourceCached(
  source: Source,
  options: ReadOptions
): Promise<LoadedSource> {
  const how = `${options.split}|${options.maxRows}|${
    options.encoding ?? "auto"
  }|${options.excelDates ?? "shown"}`;
  const key =
    source.kind === "text"
      ? `text|${how}|${source.text.length}`
      : `file|${how}|${source.file.name}|${source.file.size}|${source.file.lastModified}`;
  const text = source.kind === "text" ? source.text : undefined;
  const hit = cache.find(entry => entry.key === key && entry.text === text);
  if (hit) return hit.loaded;
  const loaded = readSource(source, options);
  const entry: CacheEntry = {key, text, loaded};
  cache = [entry, ...cache].slice(0, 2);
  loaded.catch(() => {
    cache = cache.filter(e => e !== entry);
  });
  return loaded;
}
