/* Values a spreadsheet could run as a formula when the CSV is opened:
   starting with = + - @ (or a tab or carriage return). Plain numbers such
   as -5 or +44 are left alone. */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(?:[.,]\d+)?$/;

export function isRisky(value: string): boolean {
  return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value);
}

/* Saves risky values as plain text by putting ' in front (Excel hides it). */
export function protect(value: string): string {
  return isRisky(value) ? `'${value}` : value;
}

/* Numbers with more than 15 digits: Excel rounds them (1234567890123456789
   becomes 1234567890123450000) if it reads them as numbers. */
export function isLongNumber(value: string): boolean {
  const digits = value.trim().replace(/^[+-]/, "");
  return (
    /^\d+(\.\d+)?$/.test(digits) &&
    digits.replace(".", "").replace(/^0+/, "").length > 15
  );
}

export interface Findings {
  longNumbers: number;
  longNumberExample: {row: number; column: number; value: string} | null;
  risky: number;
}

/* Looks through the chosen columns for values that need a warning. Rows
   are numbered from 1, counting data rows. */
export function inspectValues(rows: readonly (readonly string[])[]): Findings {
  const findings: Findings = {
    longNumbers: 0,
    longNumberExample: null,
    risky: 0
  };
  rows.forEach((row, r) =>
    row.forEach((value, c) => {
      if (isLongNumber(value)) {
        findings.longNumbers++;
        findings.longNumberExample ??= {row: r + 1, column: c, value};
      }
      if (isRisky(value)) findings.risky++;
    })
  );
  return findings;
}

export function pickColumns(
  rows: readonly (readonly string[])[],
  columns: readonly number[]
): string[][] {
  return rows.map(row => columns.map(i => row[i] ?? ""));
}
