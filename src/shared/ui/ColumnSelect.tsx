import React from "react";
import {Field} from "./ToolStep";

/* Picks the one column that holds a list. Hidden when there's only one. */
export function ColumnSelect({
  labels,
  value,
  onChange,
  label = "Column with the list"
}: {
  labels: string[];
  value: number;
  onChange: (column: number) => void;
  label?: string;
}) {
  if (labels.length <= 1) return null;
  return (
    <Field label={label}>
      <select
        className="tool-select"
        value={Math.min(value, labels.length - 1)}
        onChange={e => onChange(Number(e.target.value))}
      >
        {labels.map((name, i) => (
          <option key={i} value={i}>
            {name}
          </option>
        ))}
      </select>
    </Field>
  );
}
