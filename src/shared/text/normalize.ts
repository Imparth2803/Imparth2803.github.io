/* Unicode NFC, so "é" typed two different ways counts as the same letter. */
export function nfc(text: string): string {
  return text.normalize("NFC");
}

/* Splits text into lines, accepting Windows, Mac and Unix line endings. */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/* Drops the empty line a trailing line break leaves at the end. */
export function withoutTrailingEmptyLine(lines: string[]): string[] {
  return lines.length > 0 && lines[lines.length - 1] === ""
    ? lines.slice(0, -1)
    : lines;
}
