import React, {useState} from "react";
import {
  FitMode,
  planResize,
  PRESETS,
  SizeChoice
} from "../../../shared/images/resizePlan";
import {formatCount} from "../../../shared/text/numbers";
import {Choice, Field, Notice} from "../../../shared/ui/ToolStep";
import type {Resize} from "../logic/edits";

const MODES: {value: FitMode; label: string; hint: string}[] = [
  {
    value: "contain",
    label: "Contain",
    hint: "The whole image fits inside the size. Empty space is filled (see-through, or the background colour in a JPG). Never cropped or distorted."
  },
  {
    value: "cover",
    label: "Cover",
    hint: "The image fills the size exactly. Edges that don't fit are cut off."
  },
  {
    value: "stretch",
    label: "Stretch",
    hint: "The image is forced to the size, so it may look squashed or stretched."
  }
];

type Kind = "keep" | "custom" | "percent" | string; // a preset: "WxH"

const digits = (s: string) => s.replace(/\D/g, "").slice(0, 5);
const toNumber = (s: string) => {
  const n = Number(s);
  return s !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

/* Resize: the Bulk Image Resizer's sizes, presets and fit modes, for the
   image being edited (after any crop). Nothing is resized until a size is
   chosen; changing it always works from the original, so it never blurs
   the picture more than once. */
export function ResizePanel({
  resize,
  imageSize,
  maxSide,
  maxMegapixels,
  onChange,
  onPreview
}: {
  resize: Resize | null;
  /** The image after rotate & flip and crop. */
  imageSize: {width: number; height: number};
  maxSide: number;
  maxMegapixels: number;
  onChange: (resize: Resize | null) => void;
  /** Shows a size while it is being typed. */
  onPreview: (resize: Resize | null) => void;
}) {
  const initial = (): {
    kind: Kind;
    width: string;
    height: string;
    percent: string;
  } => {
    const c = resize?.choice;
    if (!c) return {kind: "keep", width: "", height: "", percent: "50"};
    if (c.kind === "percent") {
      return {
        kind: "percent",
        width: "",
        height: "",
        percent: String(c.percent)
      };
    }
    const preset = PRESETS.find(
      p => p.width === c.width && p.height === c.height
    );
    return {
      kind: preset ? `${preset.width}x${preset.height}` : "custom",
      width: c.width === null ? "" : String(c.width),
      height: c.height === null ? "" : String(c.height),
      percent: "50"
    };
  };
  const [form, setForm] = useState(initial);
  const [fit, setFit] = useState<FitMode>(resize?.fit ?? "contain");
  const [problem, setProblem] = useState<string | null>(null);

  const choiceOf = (f: typeof form): SizeChoice | null => {
    if (f.kind === "keep") return null;
    if (f.kind === "percent") {
      const p = toNumber(f.percent);
      return p ? {kind: "percent", percent: Math.min(1000, p)} : null;
    }
    if (f.kind === "custom") {
      const w = toNumber(f.width);
      const h = toNumber(f.height);
      return w || h ? {kind: "box", width: w, height: h} : null;
    }
    const [w, h] = f.kind.split("x").map(Number);
    return {kind: "box", width: w!, height: h!};
  };

  /** Shows (or, when final, records) the size, unless it is too big for
      this device. */
  const apply = (f: typeof form, mode: FitMode, final = true) => {
    const send = final ? onChange : onPreview;
    setForm(f);
    setFit(mode);
    const choice = choiceOf(f);
    if (f.kind === "keep") {
      setProblem(null);
      send(null);
      return;
    }
    if (!choice) return; // still being typed
    const plan = planResize(imageSize.width, imageSize.height, choice, mode);
    if (
      plan.width > maxSide ||
      plan.height > maxSide ||
      (plan.width * plan.height) / 1e6 > maxMegapixels
    ) {
      setProblem(
        `${formatCount(plan.width)} × ${formatCount(
          plan.height
        )} pixels is larger than this device can make (up to ${formatCount(
          maxSide
        )} pixels a side and ${maxMegapixels} megapixels). Choose a smaller size; nothing was changed.`
      );
      return;
    }
    setProblem(null);
    send({choice, fit: mode});
  };
  /** Records what was typed (when leaving the field or pressing Enter). */
  const typed = {
    onBlur: () => apply(form, fit),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") apply(form, fit);
    }
  };

  const choice = resize?.choice ?? null;
  const plan = choice
    ? planResize(imageSize.width, imageSize.height, choice, resize!.fit)
    : null;
  const bothSides =
    form.kind !== "keep" &&
    form.kind !== "percent" &&
    (form.kind !== "custom" ||
      (!!toNumber(form.width) && !!toNumber(form.height)));
  const sizeText = plan
    ? `${formatCount(plan.width)} × ${formatCount(plan.height)}`
    : "";

  return (
    <div className="editor-panel-body">
      <Field label="New size">
        <select
          className="tool-select"
          value={form.kind}
          onChange={e => {
            const kind = e.target.value;
            const next = {...form, kind};
            if (kind === "custom" && !form.width && !form.height) {
              next.width = String(imageSize.width);
            }
            apply(next, fit);
          }}
        >
          <option value="keep">
            Keep the size ({formatCount(imageSize.width)} ×{" "}
            {formatCount(imageSize.height)})
          </option>
          {PRESETS.map(p => (
            <option key={p.label} value={`${p.width}x${p.height}`}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom size…</option>
          <option value="percent">A percentage of the size…</option>
        </select>
      </Field>

      {form.kind === "custom" && (
        <>
          <div className="editor-exact-grid">
            <div className="tool-field">
              <label className="tool-field-label" htmlFor="resize-width">
                Width (pixels)
              </label>
              <input
                id="resize-width"
                className="tool-input"
                inputMode="numeric"
                value={form.width}
                onChange={e =>
                  apply({...form, width: digits(e.target.value)}, fit, false)
                }
                {...typed}
              />
            </div>
            <div className="tool-field">
              <label className="tool-field-label" htmlFor="resize-height">
                Height (pixels)
              </label>
              <input
                id="resize-height"
                className="tool-input"
                inputMode="numeric"
                value={form.height}
                onChange={e =>
                  apply({...form, height: digits(e.target.value)}, fit, false)
                }
                {...typed}
              />
            </div>
          </div>
          <p className="tool-field-hint">
            Leave one empty to keep the image's shape.
          </p>
        </>
      )}
      {form.kind === "percent" && (
        <div className="tool-field">
          <label className="tool-field-label" htmlFor="resize-percent">
            Percentage
          </label>
          <input
            id="resize-percent"
            className="tool-input editor-number"
            inputMode="numeric"
            value={form.percent}
            onChange={e =>
              apply({...form, percent: digits(e.target.value)}, fit, false)
            }
            {...typed}
          />
          <span className="tool-field-hint">
            50 makes the image half as wide and half as tall.
          </span>
        </div>
      )}

      {bothSides && (
        <>
          <Choice
            label="How the image fits the size"
            value={fit}
            onChange={mode => apply(form, mode)}
            options={MODES}
          />
          <p className="tool-field-hint">
            {MODES.find(m => m.value === fit)!.hint}
          </p>
        </>
      )}

      {problem && <Notice tone="error">{problem}</Notice>}
      {plan && !problem && (
        <>
          <div className="editor-save-result" aria-live="polite">
            <p>Result: {sizeText} pixels</p>
          </div>
          {plan.cropped && (
            <Notice tone="warning">
              Cropped: some of the edges are cut off to fill {sizeText}.
            </Notice>
          )}
          {plan.stretched && (
            <Notice tone="warning">
              Stretched: the picture is squashed or stretched to fit {sizeText}.
            </Notice>
          )}
          {plan.enlarged && (
            <Notice tone="warning">
              Enlarged: the image is smaller than the new size, so it may look
              blurry.
            </Notice>
          )}
        </>
      )}
      <p className="tool-field-hint">
        Resizing happens after the crop, and always starts from the original, so
        changing the size again doesn't blur the picture more.
      </p>
    </div>
  );
}
