/* The one table shape every text/spreadsheet tool works with. Every cell is
   a string, so IDs like "007" or "9876543210123456" are never turned into
   numbers by accident. */
export interface Table {
  rows: string[][];
}

export interface Sheet extends Table {
  name: string;
}

export function columnCount(rows: readonly (readonly string[])[]): number {
  let max = 0;
  for (const row of rows) if (row.length > max) max = row.length;
  return max;
}

/* Gives every row the same number of cells, filling gaps with "". */
export function padRows(rows: string[][]): string[][] {
  const width = columnCount(rows);
  return rows.map(row =>
    row.length === width
      ? row
      : row.concat(Array<string>(width - row.length).fill(""))
  );
}

export function autoColumnNames(count: number): string[] {
  return Array.from({length: count}, (_, i) => `Column ${i + 1}`);
}

/* Column labels for pickers: the first row's values when it holds the
   column names (blank ones fall back to "Column N"), otherwise Column 1..N. */
export function columnLabels(
  firstRow: readonly string[] | undefined,
  count: number,
  firstRowIsHeader: boolean
): string[] {
  return autoColumnNames(count).map((fallback, i) => {
    const name = firstRowIsHeader ? (firstRow?.[i] ?? "").trim() : "";
    return name || fallback;
  });
}
