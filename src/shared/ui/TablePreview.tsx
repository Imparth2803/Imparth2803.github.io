import React from "react";
import {formatCount} from "../text/numbers";

/* A preview of the first rows of a result. Only a slice is ever drawn, so a
   100,000-row result doesn't slow the page down. */
export function TablePreview({
  header,
  rows,
  totalRows,
  label,
  highlight
}: {
  header: readonly string[] | null;
  rows: readonly (readonly string[])[];
  totalRows: number;
  label: string;
  /** Rows to mark as problems (same order as `rows`). */
  highlight?: readonly boolean[];
}) {
  const width = Math.max(header?.length ?? 0, ...rows.map(row => row.length));
  return (
    <figure className="tool-preview">
      <div className="tool-preview-scroll" tabIndex={0} aria-label={label}>
        <table>
          {header && (
            <thead>
              <tr>
                {header.map((name, i) => (
                  <th key={i} scope="col">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, r) => (
              <tr
                key={r}
                className={highlight?.[r] ? "tool-row-problem" : undefined}
              >
                {Array.from({length: width}, (_, c) => (
                  <td key={c}>{row[c] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="tool-muted">
        {rows.length < totalRows
          ? `Showing the first ${formatCount(rows.length)} of ${formatCount(
              totalRows
            )} rows. Downloads include all of them.`
          : `${formatCount(totalRows)} ${totalRows === 1 ? "row" : "rows"}`}
      </figcaption>
    </figure>
  );
}

/* A preview of text output, cut short for very long results. */
export function TextPreview({
  text,
  totalLength,
  label
}: {
  text: string;
  totalLength: number;
  label: string;
}) {
  return (
    <figure className="tool-preview">
      <pre className="tool-preview-text" tabIndex={0} aria-label={label}>
        {text}
      </pre>
      {text.length < totalLength && (
        <figcaption className="tool-muted">
          Showing the start of the result ({formatCount(text.length)} of{" "}
          {formatCount(totalLength)} characters). Copy and Download include all
          of it.
        </figcaption>
      )}
    </figure>
  );
}
