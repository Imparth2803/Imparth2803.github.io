import React from "react";
import {flip, MAX_FINE, straighten, Transform, turn} from "../logic/edits";

/* Rotate & flip: quarter turns, mirroring and straightening. Buttons make
   a change straight away; the straighten slider shows the change while
   dragging and records it (for Undo) when let go. */
export function TransformPanel({
  transform,
  onChange,
  onPreview,
  onReset
}: {
  transform: Transform;
  /** Records a change (it can be undone). */
  onChange: (t: Transform) => void;
  /** Shows a change while a slider is being dragged. */
  onPreview: (t: Transform) => void;
  onReset: () => void;
}) {
  const changed =
    transform.quarter !== 0 ||
    transform.fine !== 0 ||
    transform.flipX ||
    transform.flipY;
  const finish = () => onChange(transform);

  return (
    <div className="editor-panel-body">
      <div className="editor-button-grid">
        <button
          type="button"
          className="tool-button"
          onClick={() => onChange(turn(transform, -1))}
        >
          <i className="fas fa-undo" aria-hidden="true"></i> Turn left
        </button>
        <button
          type="button"
          className="tool-button"
          onClick={() => onChange(turn(transform, 1))}
        >
          <i className="fas fa-redo" aria-hidden="true"></i> Turn right
        </button>
        <button
          type="button"
          className="tool-button"
          onClick={() => onChange(turn(transform, 2))}
        >
          <i className="fas fa-sync-alt" aria-hidden="true"></i> Upside down
        </button>
        <button
          type="button"
          className="tool-button"
          onClick={() => onChange(flip(transform, "x"))}
        >
          <i className="fas fa-arrows-alt-h" aria-hidden="true"></i> Mirror
          left–right
        </button>
        <button
          type="button"
          className="tool-button"
          onClick={() => onChange(flip(transform, "y"))}
        >
          <i className="fas fa-arrows-alt-v" aria-hidden="true"></i> Mirror
          top–bottom
        </button>
      </div>
      <p className="tool-field-hint">
        Turn left and right turn by a quarter (90°). Mirroring flips the image
        as you see it.
      </p>

      <div className="tool-field">
        <label className="tool-field-label" htmlFor="editor-straighten">
          Straighten (degrees)
        </label>
        <div className="editor-slider-row">
          <input
            id="editor-straighten"
            type="range"
            min={-MAX_FINE}
            max={MAX_FINE}
            step={0.5}
            value={transform.fine}
            onChange={e =>
              onPreview(straighten(transform, Number(e.target.value)))
            }
            onPointerUp={finish}
            onKeyUp={finish}
            onBlur={finish}
          />
          <input
            className="tool-input editor-number"
            type="number"
            aria-label="Straighten, in degrees"
            min={-MAX_FINE}
            max={MAX_FINE}
            step={0.5}
            value={transform.fine}
            onChange={e =>
              onChange(straighten(transform, Number(e.target.value)))
            }
          />
        </div>
        <span className="tool-field-hint">
          For photos taken at a slight angle. The image is made a little larger
          so nothing is cut off; the new corners are see-through (or filled with
          the background colour in a JPG).
        </span>
      </div>

      <button
        type="button"
        className="tool-button tool-button-quiet"
        disabled={!changed}
        onClick={onReset}
      >
        Reset rotate &amp; flip
      </button>
    </div>
  );
}
