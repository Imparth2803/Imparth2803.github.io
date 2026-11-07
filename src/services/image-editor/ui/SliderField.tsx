import React from "react";

/* A setting with a slider, a number field and its own reset. Moving the
   slider or typing shows the change straight away; it is recorded for
   Undo once, when the slider is let go or the field is left. */
export function SliderField({
  id,
  label,
  min,
  max,
  step = 1,
  value,
  unit,
  resetTo = 0,
  onPreview,
  onCommit,
  onReset
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  /** Shown after the label, such as "%" or "px". */
  unit?: string;
  /** The value Reset goes back to. */
  resetTo?: number;
  onPreview: (value: number) => void;
  /** Records the value shown now. */
  onCommit: () => void;
  onReset: () => void;
}) {
  const clamp = (v: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : resetTo;
  return (
    <div className="tool-field editor-slider-field">
      <div className="editor-slider-head">
        <label className="tool-field-label" htmlFor={id}>
          {label}
          {unit ? ` (${unit})` : ""}
        </label>
        <button
          type="button"
          className="editor-reset-one"
          aria-label={`Reset ${label.toLowerCase()}`}
          disabled={value === resetTo}
          onClick={onReset}
        >
          Reset
        </button>
      </div>
      <div className="editor-slider-row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onPreview(clamp(Number(e.target.value)))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          onBlur={onCommit}
        />
        <input
          className="tool-input editor-number"
          type="number"
          aria-label={`${label}, as a number`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onPreview(clamp(Number(e.target.value)))}
          onBlur={onCommit}
          onKeyDown={e => {
            if (e.key === "Enter") onCommit();
          }}
        />
      </div>
    </div>
  );
}
