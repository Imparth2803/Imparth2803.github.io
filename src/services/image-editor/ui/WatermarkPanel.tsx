import React, {useRef} from "react";
import {Field, Notice} from "../../../shared/ui/ToolStep";
import {
  Anchor,
  FontId,
  FONTS,
  MAX_WATERMARK_TEXT,
  NEW_WATERMARK,
  Watermark
} from "../logic/watermark";
import {ColourInput} from "./ColourInput";
import {SliderField} from "./SliderField";

export interface LogoInfo {
  name: string;
  width: number;
  height: number;
}

const ANCHORS: {id: Anchor; label: string}[] = [
  {id: "top-left", label: "Top left"},
  {id: "top-center", label: "Top middle"},
  {id: "top-right", label: "Top right"},
  {id: "center", label: "Middle"},
  {id: "bottom-left", label: "Bottom left"},
  {id: "bottom-center", label: "Bottom middle"},
  {id: "bottom-right", label: "Bottom right"},
  {id: "custom", label: "Where I dragged it"}
];

/* Watermark: text or a logo, placed at a corner, the middle, where it is
   dragged, or repeated over the whole picture. */
export function WatermarkPanel({
  watermark,
  logos,
  logoError,
  onChange,
  onPreview,
  onPickLogo
}: {
  watermark: Watermark | null;
  /** The logos that are open, by id. */
  logos: ReadonlyMap<string, LogoInfo>;
  logoError: string | null;
  onChange: (watermark: Watermark | null) => void;
  onPreview: (watermark: Watermark) => void;
  onPickLogo: (file: File) => void;
}) {
  const logoInput = useRef<HTMLInputElement>(null);
  const w = watermark;
  const kind = w?.kind ?? "none";

  const picker = (
    <input
      ref={logoInput}
      id="editor-logo-file"
      type="file"
      hidden
      accept=".png,.webp,.jpg,.jpeg,.gif,.bmp,.avif"
      onChange={e => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) onPickLogo(file);
      }}
    />
  );

  const kindChoice = (
    <Field label="Watermark">
      <div className="editor-button-grid" role="group" aria-label="Watermark">
        {(["none", "text", "logo"] as const).map(k => (
          <button
            key={k}
            type="button"
            className="tool-button"
            aria-pressed={kind === k}
            onClick={() =>
              onChange(k === "none" ? null : {...(w ?? NEW_WATERMARK), kind: k})
            }
          >
            {k === "none" ? "None" : k === "text" ? "Text" : "Logo"}
          </button>
        ))}
      </div>
    </Field>
  );

  if (!w) {
    return (
      <div className="editor-panel-body">
        {picker}
        {kindChoice}
        <span className="tool-field-hint">
          Add your name, a copyright line or a logo. The original picture is not
          changed.
        </span>
      </div>
    );
  }

  const slider = (
    key:
      | "sizePct"
      | "logoWidthPct"
      | "opacity"
      | "rotation"
      | "marginPct"
      | "spacingPct",
    label: string,
    min: number,
    max: number,
    unit: string,
    resetTo: number
  ) => (
    <SliderField
      id={`watermark-${key}`}
      label={label}
      unit={unit}
      min={min}
      max={max}
      value={w[key]}
      resetTo={resetTo}
      onPreview={v => onPreview({...w, [key]: Math.round(v)})}
      onCommit={() => onChange(w)}
      onReset={() => onChange({...w, [key]: resetTo})}
    />
  );
  const logo = w.logoId ? logos.get(w.logoId) : undefined;
  const finishOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onChange(w);
  };

  return (
    <div className="editor-panel-body">
      {picker}
      {kindChoice}

      {w.kind === "text" ? (
        <>
          <div className="tool-field">
            <label className="tool-field-label" htmlFor="watermark-text">
              Text
            </label>
            <input
              id="watermark-text"
              className="tool-input"
              type="text"
              maxLength={MAX_WATERMARK_TEXT}
              value={w.text}
              onChange={e => onPreview({...w, text: e.target.value})}
              onBlur={() => onChange(w)}
              onKeyDown={finishOnEnter}
            />
          </div>
          <div className="editor-slider-row">
            <select
              className="tool-select"
              aria-label="Font"
              value={w.font}
              onChange={e => onChange({...w, font: e.target.value as FontId})}
            >
              {(Object.keys(FONTS) as FontId[]).map(id => (
                <option key={id} value={id}>
                  {FONTS[id].label}
                </option>
              ))}
            </select>
            <label className="editor-checkbox-row">
              <input
                type="checkbox"
                checked={w.bold}
                onChange={e => onChange({...w, bold: e.target.checked})}
              />
              <span>Bold</span>
            </label>
            <ColourInput
              label="Text colour"
              value={w.colour}
              onPreview={colour => onPreview({...w, colour})}
              onFinish={() => onChange(w)}
            />
          </div>
          {slider("sizePct", "Text size", 1, 30, "% of the shorter side", 6)}
        </>
      ) : (
        <>
          <button
            type="button"
            className="tool-button"
            onClick={() => logoInput.current?.click()}
          >
            <i className="fas fa-image" aria-hidden="true"></i>{" "}
            {logo ? "Choose another logo" : "Choose a logo"}
          </button>
          {logo && (
            <p className="tool-field-hint editor-logo-name">
              {logo.name} ({logo.width} × {logo.height}). See-through areas stay
              see-through.
            </p>
          )}
          {w.logoId && !logo && (
            <Notice tone="warning">
              Pick the logo again: it was closed to save memory.
            </Notice>
          )}
          {logoError && <Notice tone="error">{logoError}</Notice>}
          {slider("logoWidthPct", "Logo width", 5, 80, "% of the width", 25)}
        </>
      )}

      {slider("opacity", "Opacity", 0, 100, "%", 70)}
      {slider("rotation", "Rotation", -180, 180, "degrees", 0)}

      <label className="editor-checkbox-row">
        <input
          type="checkbox"
          checked={w.tiled}
          onChange={e => onChange({...w, tiled: e.target.checked})}
        />
        <span>Repeat over the whole picture</span>
      </label>

      {w.tiled ? (
        slider("spacingPct", "Spacing", 5, 100, "% of the shorter side", 15)
      ) : (
        <>
          <Field label="Position">
            <select
              className="tool-select"
              aria-label="Position"
              value={w.anchor}
              onChange={e => onChange({...w, anchor: e.target.value as Anchor})}
            >
              {ANCHORS.filter(
                a => a.id !== "custom" || w.anchor === "custom"
              ).map(a => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          {w.anchor !== "custom" &&
            slider("marginPct", "Gap to the edge", 0, 20, "%", 3)}
          <span className="tool-field-hint">
            Or drag the watermark on the picture. Select it to move it with the
            arrow keys (Shift for bigger steps).
          </span>
        </>
      )}
    </div>
  );
}
