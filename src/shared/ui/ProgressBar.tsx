import React from "react";

export function ProgressBar({
  done,
  total,
  label
}: {
  done: number;
  total: number;
  label: string;
}) {
  return (
    <div className="tool-progress">
      <progress max={total} value={done} aria-label={label} />
      <span className="tool-muted" role="status">
        {label}: {done} of {total}
      </span>
    </div>
  );
}
