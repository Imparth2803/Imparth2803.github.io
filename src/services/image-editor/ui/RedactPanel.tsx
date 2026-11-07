import React from "react";
import {Notice} from "../../../shared/ui/ToolStep";
import {NO_REDACTIONS, Redaction} from "../logic/edits";
import {ColourInput} from "./ColourInput";
import {FieldGroup} from "./FieldGroup";

export const REDACT_WARNING =
  "Blur and pixelation can sometimes be reversed. For passwords, ID numbers, addresses and other private details, use a solid box.";

const KINDS: {id: Redaction["kind"]; label: string}[] = [
  {id: "solid", label: "Solid box"},
  {id: "blur", label: "Blur"},
  {id: "pixelate", label: "Pixelate"}
];

/** A new area in the middle of the image. */
export function newRedaction(
  existing: Redaction[],
  at: Pick<Redaction, "x" | "y" | "w" | "h"> = {
    x: 0.35,
    y: 0.425,
    w: 0.3,
    h: 0.15
  }
): Redaction {
  const id = existing.reduce((most, r) => Math.max(most, r.id), 0) + 1;
  // New areas copy the last one's kind and colour.
  const last = existing[existing.length - 1];
  return {
    id,
    ...at,
    kind: last?.kind ?? "solid",
    colour: last?.colour ?? "#000000"
  };
}

/* Hide areas: solid boxes, blur or pixelation over parts of the picture.
   They are drawn into the saved file's pixels, not laid on top. */
export function RedactPanel({
  redactions,
  onChange,
  onPreview
}: {
  redactions: Redaction[];
  onChange: (redactions: Redaction[]) => void;
  onPreview: (redactions: Redaction[]) => void;
}) {
  const update = (id: number, patch: Partial<Redaction>, final = true) => {
    const next = redactions.map(r => (r.id === id ? {...r, ...patch} : r));
    (final ? onChange : onPreview)(next);
  };

  return (
    <div className="editor-panel-body">
      <Notice tone="warning">{REDACT_WARNING}</Notice>
      <button
        type="button"
        className="tool-button tool-button-primary"
        onClick={() => onChange([...redactions, newRedaction(redactions)])}
      >
        <i className="fas fa-plus" aria-hidden="true"></i> Add hidden area
      </button>
      <span className="tool-field-hint">
        Or drag on the picture to draw one. Select an area to move it with the
        arrow keys (Shift for bigger steps), resize it with Alt and the arrow
        keys, or remove it with Delete.
      </span>

      {redactions.length > 0 && (
        <ol className="editor-redaction-list">
          {redactions.map((r, i) => (
            <li key={r.id}>
              <FieldGroup label={`Hidden area ${i + 1}`}>
                <div className="editor-slider-row">
                  <select
                    className="tool-select"
                    aria-label={`How to hide area ${i + 1}`}
                    value={r.kind}
                    onChange={e =>
                      update(r.id, {kind: e.target.value as Redaction["kind"]})
                    }
                  >
                    {KINDS.map(k => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  {r.kind === "solid" && (
                    <ColourInput
                      label={`Colour of area ${i + 1}`}
                      value={r.colour}
                      onPreview={colour => update(r.id, {colour}, false)}
                      onFinish={() => onChange(redactions)}
                    />
                  )}
                  <button
                    type="button"
                    className="tool-button tool-button-quiet"
                    aria-label={`Remove hidden area ${i + 1}`}
                    onClick={() =>
                      onChange(redactions.filter(x => x.id !== r.id))
                    }
                  >
                    <i className="fas fa-trash-alt" aria-hidden="true"></i>
                  </button>
                </div>
              </FieldGroup>
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        className="tool-button tool-button-quiet"
        disabled={redactions.length === 0}
        onClick={() => onChange(NO_REDACTIONS)}
      >
        Remove all hidden areas
      </button>
    </div>
  );
}
