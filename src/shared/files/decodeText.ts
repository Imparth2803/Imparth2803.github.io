import {UserError} from "../text/userError";

/** Text encodings people can choose when a file isn't UTF-8. */
export const ENCODINGS = [
  {value: "auto", label: "Work it out (UTF-8, or Western European if not)"},
  {value: "utf-8", label: "UTF-8 (most files today)"},
  {value: "windows-1252", label: "Western European (Windows-1252)"},
  {value: "windows-1250", label: "Central European (Windows-1250)"},
  {value: "windows-1251", label: "Cyrillic (Windows-1251)"},
  {value: "utf-16le", label: "Unicode (UTF-16)"}
] as const;

export type EncodingChoice = (typeof ENCODINGS)[number]["value"];

export interface DecodedText {
  text: string;
  /** Set when the file was not UTF-8 and was read another way. */
  notice?: string;
}

/* Reads a text file's bytes. Handles UTF-8 (with or without the byte-order
   mark Excel adds), UTF-16 (Excel's "Unicode Text"), and falls back to
   Windows-1252 for older Western European files. A chosen encoding is used
   as-is (after removing a byte-order mark). */
export function decodeText(
  bytes: Uint8Array,
  encoding: EncodingChoice = "auto"
): DecodedText {
  if (encoding !== "auto") {
    const bom =
      encoding === "utf-8" &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf
        ? 3
        : encoding === "utf-16le" && bytes[0] === 0xff && bytes[1] === 0xfe
        ? 2
        : 0;
    return {text: new TextDecoder(encoding).decode(bytes.subarray(bom))};
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {text: new TextDecoder("utf-16le").decode(bytes.subarray(2))};
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {text: new TextDecoder("utf-16be").decode(bytes.subarray(2))};
  }
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  if (body.indexOf(0) !== -1 && looksBinary(body)) {
    throw new UserError(
      "This doesn't look like a text file. Check that you picked the right file, or save it as a .txt or .csv file and try again."
    );
  }
  try {
    return {text: new TextDecoder("utf-8", {fatal: true}).decode(body)};
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(body),
      notice:
        'This file wasn\'t saved as UTF-8, so it was read as Western European text (Windows-1252). If some letters look wrong, save the file as "CSV UTF-8" or "Unicode text" and open it again.'
    };
  }
}

/* More than 1 in 10 of the first bytes being control characters means it's
   not text (a renamed image, a damaged file...). */
function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4096);
  let control = 0;
  for (const b of sample) {
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control > sample.length / 10;
}
