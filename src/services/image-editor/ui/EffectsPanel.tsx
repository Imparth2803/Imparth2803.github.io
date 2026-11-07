import React from "react";
import {Effects, hasEffects, NO_EFFECTS} from "../logic/pixels";
import {SliderField} from "./SliderField";

type Amount = "grayscale" | "sepia" | "pixelate" | "blur" | "sharpen";

const SETTINGS: {key: Amount; label: string; max: number; unit: string}[] = [
  {key: "grayscale", label: "Black & white", max: 100, unit: "%"},
  {key: "sepia", label: "Sepia", max: 100, unit: "%"},
  {key: "pixelate", label: "Pixelate", max: 100, unit: "block size, px"},
  {key: "blur", label: "Blur", max: 50, unit: "px"},
  {key: "sharpen", label: "Sharpen", max: 100, unit: "%"}
];

/* Effects: black & white, sepia, invert, pixelate, blur and sharpen. They
   can be combined, and are applied in that order. */
export function EffectsPanel({
  effects,
  onChange,
  onPreview
}: {
  effects: Effects;
  onChange: (effects: Effects) => void;
  onPreview: (effects: Effects) => void;
}) {
  // A 1-pixel block changes nothing, so it counts as off.
  const value = (key: Amount, v: number) =>
    key === "pixelate" && v < 2 ? 0 : Math.round(v);
  return (
    <div className="editor-panel-body">
      {SETTINGS.map(s => (
        <SliderField
          key={s.key}
          id={`effect-${s.key}`}
          label={s.label}
          unit={s.unit}
          min={0}
          max={s.max}
          value={effects[s.key]}
          onPreview={v => onPreview({...effects, [s.key]: value(s.key, v)})}
          onCommit={() => onChange(effects)}
          onReset={() => onChange({...effects, [s.key]: 0})}
        />
      ))}
      <label className="editor-checkbox-row">
        <input
          type="checkbox"
          checked={effects.invert}
          onChange={e => onChange({...effects, invert: e.target.checked})}
        />
        <span>Invert colours</span>
      </label>
      <button
        type="button"
        className="tool-button tool-button-quiet"
        disabled={!hasEffects(effects)}
        onClick={() => onChange(NO_EFFECTS)}
      >
        Reset all effects
      </button>
    </div>
  );
}
