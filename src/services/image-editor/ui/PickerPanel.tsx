import React, {useState} from "react";
import {Notice} from "../../../shared/ui/ToolStep";
import {Rgba, toHex, toHsl, toRgb} from "../logic/colour";

export const PICKER_NOTE =
  "Colours are read from the image as this browser shows it, which can differ slightly from the colour profile in the original file.";

const MAX_RECENT = 12;

/* Colour picker: the picked colour as HEX, RGB and HSL with Copy buttons,
   the recent colours, and the image's main colours. Nothing is saved: the
   lists go when the page closes. */
export function PickerPanel({
  picked,
  recent,
  palette,
  onSelect,
  onClearRecent,
  onFindPalette,
  onRemoveFromPalette
}: {
  picked: Rgba | null;
  recent: Rgba[];
  palette: string[] | null;
  onSelect: (rgba: Rgba) => void;
  onClearRecent: () => void;
  onFindPalette: () => void;
  onRemoveFromPalette: (hex: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`Copied ${label}: ${text}`);
    } catch {
      setCopied(
        `This browser didn't allow copying. Select the ${label} text and copy it yourself: ${text}`
      );
    }
  };

  const swatch = (rgba: Rgba, i: number, label: string) => (
    <button
      key={`${toHex(rgba)}-${i}`}
      type="button"
      className="editor-swatch"
      style={{background: toRgb(rgba)}}
      aria-label={`${label} ${toHex(rgba)}`}
      title={toHex(rgba)}
      onClick={() => onSelect(rgba)}
    />
  );

  return (
    <div className="editor-panel-body">
      {picked ? (
        <>
          <div className="editor-picked">
            <span
              className="editor-picked-swatch"
              style={{background: toRgb(picked)}}
              aria-hidden="true"
            />
            <dl className="editor-picked-values">
              {(
                [
                  ["HEX", toHex(picked)],
                  ["RGB", toRgb(picked)],
                  ["HSL", toHsl(picked)]
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <output aria-label={label}>{value}</output>
                    <button
                      type="button"
                      className="tool-button tool-button-quiet"
                      onClick={() => void copy(label, value)}
                    >
                      Copy {label}
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {picked[3] < 255 && (
            <p className="tool-field-hint">
              This pixel is{" "}
              {picked[3] === 0 ? "fully see-through" : "partly see-through"} (
              {Math.round((picked[3] / 255) * 100)}% solid).
            </p>
          )}
        </>
      ) : (
        <p className="tool-muted">Click or tap the picture to pick a colour.</p>
      )}
      <p className="tool-field-hint" role="status" aria-live="polite">
        {copied}
      </p>

      <div className="tool-field">
        <div className="editor-slider-head">
          <span className="tool-field-label">Recent colours</span>
          <button
            type="button"
            className="editor-reset-one"
            disabled={recent.length === 0}
            onClick={onClearRecent}
          >
            Clear
          </button>
        </div>
        {recent.length ? (
          <div className="editor-swatches" aria-label="Recent colours">
            {recent.map((c, i) => swatch(c, i, "Recent colour"))}
          </div>
        ) : (
          <span className="tool-field-hint">None yet.</span>
        )}
      </div>

      <div className="tool-field">
        <span className="tool-field-label">Main colours</span>
        {palette === null ? (
          <button type="button" className="tool-button" onClick={onFindPalette}>
            <i className="fas fa-palette" aria-hidden="true"></i> Find the main
            colours
          </button>
        ) : palette.length === 0 ? (
          <span className="tool-field-hint">No solid colours were found.</span>
        ) : (
          <ul className="editor-palette" aria-label="Main colours">
            {palette.map(hex => (
              <li key={hex}>
                <button
                  type="button"
                  className="editor-swatch"
                  style={{background: hex}}
                  aria-label={`Main colour ${hex}`}
                  title={hex}
                  onClick={() => onSelect(hexToRgba(hex))}
                />
                <span>{hex}</span>
                <button
                  type="button"
                  className="editor-reset-one"
                  aria-label={`Remove ${hex} from the main colours`}
                  onClick={() => onRemoveFromPalette(hex)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Notice tone="info">{PICKER_NOTE}</Notice>
    </div>
  );
}

const hexToRgba = (hex: string): Rgba => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

/** Adds a colour to the front of the recent list (no repeats, at most 12). */
export const addRecent = (list: Rgba[], c: Rgba): Rgba[] =>
  [c, ...list.filter(x => toHex(x) !== toHex(c))].slice(0, MAX_RECENT);
