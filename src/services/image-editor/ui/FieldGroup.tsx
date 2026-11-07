import React, {useRef} from "react";

let count = 0;

/* A titled group of several controls (buttons, a checkbox and a colour…).
   Unlike Field, it isn't a <label>: a label around buttons would give its
   text to the first button, and clicking the title would press it. */
export function FieldGroup({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = useRef(`editor-group-${++count}`).current;
  return (
    <div className="tool-field" role="group" aria-labelledby={id}>
      <span className="tool-field-label" id={id}>
        {label}
      </span>
      {children}
    </div>
  );
}
