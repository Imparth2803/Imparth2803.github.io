import React, {useState} from "react";
import {formatCount} from "../../../shared/text/numbers";
import {Field, Notice} from "../../../shared/ui/ToolStep";
import {Frame, framedSize, isFramed} from "../logic/frame";
import {ColourInput} from "./ColourInput";

type Side = "top" | "right" | "bottom" | "left";
const SIDES: {id: Side; label: string}[] = [
  {id: "top", label: "Top"},
  {id: "right", label: "Right"},
  {id: "bottom", label: "Bottom"},
  {id: "left", label: "Left"}
];

/* Border & padding. Typing in a number field (or moving a colour picker)
   shows the change straight away and records it for Undo once, when the
   field is left or Enter is pressed. Sizes the device can't make are
   refused before anything is drawn. */
export function FramePanel({
  frame,
  currentWidth,
  currentHeight,
  maxSide,
  maxMegapixels,
  onChange,
  onPreview,
  onReset
}: {
  frame: Frame;
  /** The image's size before the border and padding. */
  currentWidth: number;
  currentHeight: number;
  maxSide: number;
  maxMegapixels: number;
  /** Records a change (it can be undone). */
  onChange: (frame: Frame) => void;
  /** Shows a change while it is being typed. */
  onPreview: (frame: Frame) => void;
  onReset: () => void;
}) {
  const [sameSides, setSameSides] = useState<boolean>(() => {
    const {top, right, bottom, left} = frame.padding;
    return top === right && right === bottom && bottom === left;
  });
  /** Settings that were refused because the result would be too big. */
  const [refused, setRefused] = useState<Frame | null>(null);
  const view = refused ?? frame;

  const m = Math.min(currentWidth, currentHeight);
  const sizeOf = (f: Frame) => framedSize(currentWidth, currentHeight, f);
  const tooBig = (f: Frame) => {
    const s = sizeOf(f);
    return (
      s.width > maxSide ||
      s.height > maxSide ||
      (s.width * s.height) / 1e6 > maxMegapixels
    );
  };

  /** Shows (or, when it's final, records) new settings unless too big. */
  const propose = (next: Frame, final: boolean) => {
    if (tooBig(next)) {
      setRefused(next);
      return;
    }
    setRefused(null);
    (final ? onChange : onPreview)(next);
  };
  const finish = () => onChange(frame);
  const finishOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") finish();
  };
  const px = (value: string) => Math.max(0, Math.round(Number(value) || 0));

  const setPadding = (side: Side | "all", value: string) => {
    const p = px(value);
    propose(
      {
        ...view,
        padding:
          side === "all"
            ? {top: p, right: p, bottom: p, left: p}
            : {...view.padding, [side]: p}
      },
      false
    );
  };

  const applyPreset = (preset: Partial<Frame> & {all?: number}) => {
    const {all, ...rest} = preset;
    const next: Frame = {...frame, ...rest};
    if (all !== undefined) {
      next.padding = {top: all, right: all, bottom: all, left: all};
      setSameSides(true);
    }
    propose(next, true);
  };

  const numberProps = {
    className: "tool-input editor-number",
    type: "number",
    min: 0,
    onBlur: finish,
    onKeyDown: finishOnEnter
  } as const;

  const out = sizeOf(view);

  return (
    <div className="editor-panel-body">
      <div className="editor-presets-group">
        <span className="tool-field-label">Presets</span>
        <div className="editor-button-grid">
          <button
            type="button"
            className="tool-button"
            onClick={() => applyPreset({border: Math.round(0.01 * m)})}
          >
            Small border
          </button>
          <button
            type="button"
            className="tool-button"
            onClick={() => applyPreset({border: Math.round(0.03 * m)})}
          >
            Medium border
          </button>
          <button
            type="button"
            className="tool-button"
            onClick={() => applyPreset({border: Math.round(0.06 * m)})}
          >
            Large border
          </button>
          <button
            type="button"
            className="tool-button"
            onClick={() =>
              applyPreset({all: Math.round(0.05 * m), paddingColour: "#ffffff"})
            }
          >
            White padding
          </button>
          <button
            type="button"
            className="tool-button"
            onClick={() =>
              applyPreset({all: Math.round(0.05 * m), paddingColour: "#000000"})
            }
          >
            Black padding
          </button>
        </div>
      </div>

      <div className="tool-field">
        <label className="tool-field-label" htmlFor="frame-border-width">
          Border width (px)
        </label>
        <div className="editor-slider-row">
          <input
            {...numberProps}
            id="frame-border-width"
            value={view.border}
            onChange={e =>
              propose({...view, border: px(e.target.value)}, false)
            }
          />
          {view.border > 0 && (
            <ColourInput
              label="Border colour"
              value={view.borderColour}
              onPreview={borderColour =>
                propose({...view, borderColour}, false)
              }
              onFinish={finish}
            />
          )}
        </div>
      </div>

      <div className="tool-field">
        <label className="editor-checkbox-row">
          <input
            type="checkbox"
            checked={sameSides}
            onChange={e => {
              const checked = e.target.checked;
              setSameSides(checked);
              if (checked) applyPreset({all: frame.padding.top});
            }}
          />
          <span>Same padding on all sides</span>
        </label>
      </div>

      {sameSides ? (
        <div className="tool-field">
          <label className="tool-field-label" htmlFor="frame-pad-all">
            Padding (px)
          </label>
          <input
            {...numberProps}
            id="frame-pad-all"
            value={view.padding.top}
            onChange={e => setPadding("all", e.target.value)}
          />
        </div>
      ) : (
        <div className="editor-sides-grid">
          {SIDES.map(side => (
            <div className="tool-field" key={side.id}>
              <label
                className="tool-field-label"
                htmlFor={`frame-pad-${side.id}`}
              >
                {side.label}
              </label>
              <input
                {...numberProps}
                id={`frame-pad-${side.id}`}
                value={view.padding[side.id]}
                onChange={e => setPadding(side.id, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      <Field label="Padding background">
        <div className="editor-slider-row">
          <label className="editor-checkbox-row">
            <input
              type="checkbox"
              checked={view.paddingColour === "transparent"}
              onChange={e =>
                propose(
                  {
                    ...view,
                    paddingColour: e.target.checked ? "transparent" : "#ffffff"
                  },
                  true
                )
              }
            />
            <span>Transparent</span>
          </label>
          {view.paddingColour !== "transparent" && (
            <ColourInput
              label="Padding colour"
              value={view.paddingColour}
              onPreview={paddingColour =>
                propose({...view, paddingColour}, false)
              }
              onFinish={finish}
            />
          )}
        </div>
      </Field>

      {refused ? (
        <Notice tone="error">
          That would make the image {formatCount(out.width)} ×{" "}
          {formatCount(out.height)} pixels, larger than this device can make (up
          to {formatCount(maxSide)} pixels a side and {maxMegapixels}{" "}
          megapixels). Choose smaller numbers; nothing was changed.
        </Notice>
      ) : (
        <div className="editor-save-result" aria-live="polite">
          <p>
            Final size: {formatCount(out.width)} × {formatCount(out.height)}{" "}
            pixels
          </p>
        </div>
      )}

      <button
        type="button"
        className="tool-button tool-button-quiet"
        disabled={!isFramed(frame)}
        onClick={() => {
          setRefused(null);
          onReset();
        }}
      >
        Reset border &amp; padding
      </button>
    </div>
  );
}
