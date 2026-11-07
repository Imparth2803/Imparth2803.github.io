import React from "react";
import type {SheetSummary} from "../tabular/inspect";
import {columnLabels} from "../tabular/table";
import type {InspectState} from "./useInspect";
import {Checkbox, Field, Notice} from "./ToolStep";
import {formatCount} from "../text/numbers";

export interface SheetChoice {
  sheet: number;
  hasHeader: boolean;
}

/* Shows how the input was read and lets the person pick the sheet and say
   whether the first row holds column names. Returns the column labels to
   offer in column pickers through `children`. */
export function SourceSetup({
  state,
  choice,
  onChoice,
  children
}: {
  state: InspectState;
  choice: SheetChoice;
  onChoice: (choice: SheetChoice) => void;
  children?: (columns: string[], sheet: SheetSummary) => React.ReactNode;
}) {
  if (state.status === "empty") return null;
  if (state.status === "reading") {
    return (
      <p className="tool-muted" role="status">
        Reading…
      </p>
    );
  }
  if (state.status === "error")
    return <Notice tone="error">{state.message}</Notice>;

  const {sheets, notice} = state.result;
  const sheet = sheets[choice.sheet] ?? sheets[0];
  if (!sheet) return null;
  const columns = columnLabels(
    sheet.firstRows[0],
    sheet.columnCount,
    choice.hasHeader
  );
  const dataRows = sheet.rowCount - (choice.hasHeader ? 1 : 0);

  return (
    <div className="tool-setup">
      {notice && <Notice tone="warning">{notice}</Notice>}
      <div className="tool-setup-row">
        {sheets.length > 1 && (
          <Field label="Sheet">
            <select
              className="tool-select"
              value={choice.sheet}
              onChange={e =>
                onChoice({...choice, sheet: Number(e.target.value)})
              }
            >
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name} ({formatCount(s.rowCount)} rows)
                </option>
              ))}
            </select>
          </Field>
        )}
        <Checkbox
          label="The first row has column names"
          checked={choice.hasHeader}
          onChange={hasHeader => onChoice({...choice, hasHeader})}
        />
      </div>
      <p className="tool-muted">
        {formatCount(dataRows)} {dataRows === 1 ? "row" : "rows"}
        {sheet.columnCount > 1 ? `, ${sheet.columnCount} columns` : ""}
      </p>
      {children?.(columns, sheet)}
    </div>
  );
}

/* Sensible starting choice for a newly read input: first sheet, and treat
   the first row as column names when there are several columns. */
export function defaultSheetChoice(state: InspectState): SheetChoice {
  const first = state.status === "ready" ? state.result.sheets[0] : undefined;
  return {sheet: 0, hasHeader: (first?.columnCount ?? 1) > 1};
}
