import React from "react";
import {formatCount} from "../../../shared/text/numbers";
import {Field} from "../../../shared/ui/ToolStep";
import {Crop} from "../logic/edits";
import {centreCrop, clampRect, Rect, Size} from "../logic/geometry";

export const CROP_PRESETS = [
  {id: "free", label: "Free", ratio: null},
  {id: "1:1", label: "1:1", ratio: 1},
  {id: "4:5", label: "4:5", ratio: 4 / 5},
  {id: "3:2", label: "3:2", ratio: 3 / 2},
  {id: "16:9", label: "16:9", ratio: 16 / 9},
  {id: "9:16", label: "9:16", ratio: 9 / 16},
  {id: "4:3", label: "4:3", ratio: 4 / 3},
  {id: "exact", label: "Exact size", ratio: null}
] as const;
export type CropPreset = (typeof CROP_PRESETS)[number]["id"];

/** The crop box being edited, before Apply. Not part of Undo. */
export interface CropDraft {
  box: Rect;
  shape: Crop["shape"];
  preset: CropPreset;
}

export const ratioOf = (preset: CropPreset): number | null =>
  CROP_PRESETS.find(p => p.id === preset)!.ratio;

export function CropPanel({
  imageSize,
  draft,
  onDraft,
  onApply,
  onReset
}: {
  /** The image after rotate & flip, in pixels. */
  imageSize: Size;
  draft: CropDraft;
  onDraft: (draft: CropDraft) => void;
  onApply: (crop: Crop) => void;
  onReset: () => void;
}) {
  const {box, shape, preset} = draft;
  const aspectRatio = ratioOf(preset);

  const handlePresetSelect = (next: CropPreset) => {
    const ratio = ratioOf(next);
    onDraft({
      ...draft,
      preset: next,
      box: ratio !== null ? centreCrop(imageSize, ratio) : box
    });
  };

  const handleShapeSelect = (nextShape: Crop["shape"]) => {
    onDraft(
      nextShape === "circle"
        ? {shape: nextShape, preset: "1:1", box: centreCrop(imageSize, 1)}
        : {...draft, shape: nextShape}
    );
  };

  const handleExactChange = (width: number, height: number) => {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    onDraft({
      ...draft,
      box: clampRect({x: box.x, y: box.y, width, height}, imageSize)
    });
  };

  const handleCentre = () => {
    onDraft({
      ...draft,
      box: centreCrop(imageSize, aspectRatio ?? box.width / box.height)
    });
  };

  const handleApply = () => {
    onApply({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      shape
    });
  };

  return (
    <div className="editor-panel-body">
      <Field label="Shape">
        <div
          className="editor-button-grid"
          role="group"
          aria-label="Crop shape"
        >
          <button
            type="button"
            className="tool-button"
            aria-pressed={shape === "rect"}
            onClick={() => handleShapeSelect("rect")}
          >
            <i className="fas fa-vector-square" aria-hidden="true"></i>{" "}
            Rectangle
          </button>
          <button
            type="button"
            className="tool-button"
            aria-pressed={shape === "circle"}
            onClick={() => handleShapeSelect("circle")}
          >
            <i className="far fa-circle" aria-hidden="true"></i> Circle
          </button>
        </div>
      </Field>

      <Field label="Aspect ratio">
        <select
          className="tool-select"
          aria-label="Aspect ratio preset"
          value={preset}
          disabled={shape === "circle"}
          onChange={e => handlePresetSelect(e.target.value as CropPreset)}
        >
          {CROP_PRESETS.map(p => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {preset === "exact" && (
        <div className="editor-exact-grid">
          <div className="tool-field">
            <label className="tool-field-label" htmlFor="crop-exact-w">
              Width (px)
            </label>
            <input
              id="crop-exact-w"
              className="tool-input"
              type="number"
              min={1}
              max={imageSize.width}
              value={box.width}
              onChange={e =>
                handleExactChange(Number(e.target.value), box.height)
              }
            />
          </div>
          <div className="tool-field">
            <label className="tool-field-label" htmlFor="crop-exact-h">
              Height (px)
            </label>
            <input
              id="crop-exact-h"
              className="tool-input"
              type="number"
              min={1}
              max={imageSize.height}
              value={box.height}
              onChange={e =>
                handleExactChange(box.width, Number(e.target.value))
              }
            />
          </div>
        </div>
      )}

      <div className="editor-crop-actions">
        <button type="button" className="tool-button" onClick={handleCentre}>
          <i className="fas fa-crosshairs" aria-hidden="true"></i> Centre crop
        </button>
        <button
          type="button"
          className="tool-button tool-button-quiet"
          onClick={onReset}
        >
          Reset crop
        </button>
      </div>

      <div className="editor-crop-size" aria-live="polite">
        <p>
          Result: {formatCount(box.width)} × {formatCount(box.height)} pixels
        </p>
      </div>

      <button
        type="button"
        className="tool-button tool-button-primary"
        onClick={handleApply}
      >
        <i className="fas fa-check" aria-hidden="true"></i> Apply crop
      </button>

      <p className="tool-field-hint">
        Drag the box or its corners to select the area to keep. The original
        picture is not modified.
      </p>
    </div>
  );
}
