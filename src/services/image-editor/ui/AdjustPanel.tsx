import React from "react";
import {Adjust, isAdjusted, NO_ADJUST} from "../logic/pixels";
import {SliderField} from "./SliderField";

const SETTINGS: {
  key: keyof Adjust;
  label: string;
  min: number;
  max: number;
  unit?: string;
}[] = [
  {key: "brightness", label: "Brightness", min: -100, max: 100},
  {key: "contrast", label: "Contrast", min: -100, max: 100},
  {key: "saturation", label: "Saturation", min: -100, max: 100},
  {key: "hue", label: "Hue", min: -180, max: 180, unit: "degrees"},
  {key: "warmth", label: "Warmth", min: -100, max: 100},
  {key: "tint", label: "Tint", min: -100, max: 100}
];

/* Colour adjust: brightness, contrast, saturation, hue, warmth and tint.
   Always drawn from the original, so moving a slider back and forth never
   wears the picture down. */
export function AdjustPanel({
  adjust,
  onChange,
  onPreview
}: {
  adjust: Adjust;
  onChange: (adjust: Adjust) => void;
  onPreview: (adjust: Adjust) => void;
}) {
  return (
    <div className="editor-panel-body">
      {SETTINGS.map(s => (
        <SliderField
          key={s.key}
          id={`adjust-${s.key}`}
          label={s.label}
          unit={s.unit}
          min={s.min}
          max={s.max}
          value={adjust[s.key]}
          onPreview={v => onPreview({...adjust, [s.key]: Math.round(v)})}
          onCommit={() => onChange(adjust)}
          onReset={() => onChange({...adjust, [s.key]: 0})}
        />
      ))}
      <span className="tool-field-hint">
        Warmth makes the picture more orange (or, below 0, more blue). Tint
        makes it more pink (or, below 0, more green). Use “Show the original” to
        compare.
      </span>
      <button
        type="button"
        className="tool-button tool-button-quiet"
        disabled={!isAdjusted(adjust)}
        onClick={() => onChange(NO_ADJUST)}
      >
        Reset colour adjust
      </button>
    </div>
  );
}
