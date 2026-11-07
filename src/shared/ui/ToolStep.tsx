import React from "react";
import {formatCount} from "../text/numbers";

/* One numbered step of a tool page: 1 input, 2 settings, 3 result... */
export function ToolStep({
  step,
  title,
  children,
  aside
}: {
  step: number;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const id = `tool-step-${step}`;
  return (
    <section className="tool-step" aria-labelledby={id}>
      <div className="tool-step-head">
        <h2 id={id}>
          <span className="tool-step-number">{step}</span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Notice({
  tone,
  children
}: {
  tone: "error" | "info" | "warning" | "success";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`tool-notice tool-notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

/* The main action button, plus a Stop button while it runs. */
export function ActionBar({
  label,
  busyLabel,
  disabled,
  onRun,
  onCancel,
  onReset
}: {
  label: string;
  busyLabel: string | null;
  disabled: boolean;
  onRun: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  return (
    <div className="tool-actions-row">
      <button
        type="button"
        className="tool-button tool-button-primary"
        disabled={disabled || busyLabel !== null}
        onClick={onRun}
      >
        {busyLabel ?? label}
      </button>
      {busyLabel !== null && (
        <button type="button" className="tool-button" onClick={onCancel}>
          Stop
        </button>
      )}
      <button
        type="button"
        className="tool-button tool-button-quiet"
        onClick={onReset}
      >
        Start over
      </button>
    </div>
  );
}

/* Small "label: value" figures, e.g. "Rows: 1,204". */
export function Summary({items}: {items: [string, string | number][]}) {
  return (
    <dl className="tool-summary">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{typeof value === "number" ? formatCount(value) : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="tool-field">
      <span className="tool-field-label">{label}</span>
      {children}
      {hint && <span className="tool-field-hint">{hint}</span>}
    </label>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="tool-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="tool-field-hint">{hint}</span>}
      </span>
    </label>
  );
}

/* A set of mutually exclusive buttons (like radio buttons). */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: readonly {value: T; label: string}[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="tool-field">
      <span className="tool-field-label">{label}</span>
      <div className="tool-choice" role="group" aria-label={label}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
