import React, {useEffect, useState} from "react";
import {downloadBlob} from "../../../shared/files/download";
import type {Level} from "../../../shared/images/compressLevels";
import {IMAGE_TYPES, ImageType, InputType} from "../../../shared/images/header";
import {formatBytes} from "../../../shared/limits";
import {formatCount} from "../../../shared/text/numbers";
import {Field, Notice} from "../../../shared/ui/ToolStep";
import {CancelledError, ToolError} from "../../../shared/worker/WorkerClient";
import type {WorkerClient} from "../../../shared/worker/WorkerClient";
import type {Edits} from "../logic/edits";
import type {ImageEditorApi} from "../worker/imageEditor.worker";

export interface SaveSettings {
  format: ImageType;
  /** 1–100, for JPG and WebP. */
  quality: number;
  /** Fills see-through areas in a JPG. */
  background: string;
  /** Without the extension. */
  name: string;
  /** JPG only: copy the original's camera details (never the location). */
  keepCamera?: boolean;
  /** Make the file smaller (as the Smart Image Compressor does). */
  squeeze?: Squeeze;
}

export type Squeeze =
  | {kind: "off"}
  | {kind: "level"; level: Level; custom: number}
  | {kind: "target"; kb: number; allowResize: boolean};

const SQUEEZE_LEVELS: {value: string; label: string}[] = [
  {value: "off", label: "No (use the quality above)"},
  {value: "high", label: "High quality (a little smaller)"},
  {value: "balanced", label: "Balanced"},
  {value: "small", label: "Small file"},
  {value: "custom", label: "Custom…"},
  {value: "target", label: "Aim for a file size…"}
];

/** What Save makes: the file, its size, and (for JPG) whether the camera
    details were copied. */
export interface MadeFile {
  blob: Blob;
  width: number;
  height: number;
  camera?: "kept" | "none" | "damaged" | "too-big" | null;
  /** From making the file smaller. */
  notes?: string[];
  reached?: boolean;
  needs?: "resize" | "webp" | null;
  /** The size aimed for, in bytes. */
  aimed?: number | null;
}

export type RenderFile = (settings: {
  format: ImageType;
  /** 0–1. */
  quality: number;
  background: string;
}) => Promise<MadeFile>;

export const DEFAULT_QUALITY: Record<ImageType, number> = {
  jpeg: 92,
  png: 100,
  webp: 90
};

/** Characters that aren't allowed in file names on some computers. */
export const cleanName = (name: string) =>
  name.replace(/[\\/:*?"<>|]+/g, "").trim() || "image";

/* Save: choose the file type, quality and name. The file is made in the
   background as soon as the settings settle, so its real size can be
   shown before downloading. */
export function SavePanel({
  client,
  edits,
  settings,
  onSettings,
  webpOk,
  seeThrough,
  sourceType,
  hasCameraDetails = false,
  render
}: {
  client: WorkerClient<ImageEditorApi>;
  /** The edits to save (not used when `render` is given). */
  edits?: Edits;
  settings: SaveSettings;
  onSettings: (settings: SaveSettings) => void;
  webpOk: boolean;
  /** Whether the result has see-through areas. */
  seeThrough: boolean;
  sourceType?: InputType;
  /** Whether the original has camera details that could be kept. */
  hasCameraDetails?: boolean;
  /** Makes the file some other way (the collage uses this). */
  render?: RenderFile;
}) {
  const {format, quality, background} = settings;
  const [made, setMade] = useState<MadeFile | null>(null);
  const keepCamera =
    !render && hasCameraDetails && format === "jpeg" && !!settings.keepCamera;
  const squeeze: Squeeze = render
    ? {kind: "off"}
    : settings.squeeze ?? {kind: "off"};
  const squeezeKey = JSON.stringify(squeeze);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setMade(null);
    setError(null);
    const timer = setTimeout(() => {
      (render
        ? render({format, quality: quality / 100, background})
        : client.call("save", {
            edits: edits!,
            format,
            quality: quality / 100,
            background,
            keepCamera,
            compress: compressFor(JSON.parse(squeezeKey) as Squeeze)
          })
      ).then(
        result => current && setMade(result),
        e => {
          if (!current || e instanceof CancelledError) return;
          setError(
            e instanceof ToolError
              ? e.message
              : "The file couldn't be made. Try another file type."
          );
        }
      );
    }, 350);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [
    client,
    edits,
    format,
    quality,
    background,
    keepCamera,
    render,
    squeezeKey
  ]);

  const fileName = `${cleanName(settings.name)}.${IMAGE_TYPES[format].ext}`;
  const lossy = format !== "png";

  return (
    <div className="editor-panel-body">
      <Field
        label="File type"
        hint={webpOk ? undefined : "This browser can't save WebP images."}
      >
        <select
          className="tool-select"
          value={format}
          onChange={e => {
            const next = e.target.value as ImageType;
            onSettings({
              ...settings,
              format: next,
              quality: DEFAULT_QUALITY[next]
            });
          }}
        >
          <option value="jpeg">JPG (photos, smallest files)</option>
          <option value="png">PNG (exact, keeps see-through areas)</option>
          <option value="webp" disabled={!webpOk}>
            WebP (small files for websites)
          </option>
        </select>
      </Field>
      {sourceType === "gif" && (
        <p className="tool-field-hint">Only the first frame is kept.</p>
      )}

      {lossy && squeeze.kind === "off" && (
        <div className="tool-field">
          <label className="tool-field-label" htmlFor="editor-quality">
            Quality: {quality}
          </label>
          <input
            id="editor-quality"
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={e =>
              onSettings({...settings, quality: Number(e.target.value)})
            }
          />
          <span className="tool-field-hint">
            Lower quality makes a smaller file but can blur fine detail. 85–95
            looks the same as the original for most photos.
          </span>
        </div>
      )}

      {format === "jpeg" && seeThrough && (
        <>
          <Notice tone="warning">
            JPG can't be see-through, so see-through areas will be filled with
            the background colour.
          </Notice>
          <Field label="Background colour">
            <input
              className="tool-color"
              type="color"
              value={background}
              onChange={e =>
                onSettings({...settings, background: e.target.value})
              }
            />
          </Field>
        </>
      )}

      {!render && (
        <SqueezeFields
          squeeze={squeeze}
          format={format}
          onChange={next => onSettings({...settings, squeeze: next})}
        />
      )}

      {!render && hasCameraDetails && format === "jpeg" && (
        <label className="editor-checkbox-row">
          <input
            type="checkbox"
            checked={!!settings.keepCamera}
            onChange={e =>
              onSettings({...settings, keepCamera: e.target.checked})
            }
          />
          <span>Keep camera details (without location)</span>
        </label>
      )}
      {made?.camera === "too-big" && (
        <Notice tone="warning">
          The camera details are too large to copy into a JPG, so they were left
          out.
        </Notice>
      )}
      {made?.camera === "damaged" && (
        <Notice tone="warning">
          The original's camera details are damaged, so they were left out.
        </Notice>
      )}

      <div className="tool-field">
        <label className="tool-field-label" htmlFor="editor-file-name">
          File name
        </label>
        <div className="editor-name-row">
          <input
            id="editor-file-name"
            className="tool-input"
            value={settings.name}
            onChange={e => onSettings({...settings, name: e.target.value})}
          />
          <span>.{IMAGE_TYPES[format].ext}</span>
        </div>
      </div>

      <div className="editor-save-result" aria-live="polite">
        {made ? (
          <p>
            {formatCount(made.width)} × {formatCount(made.height)} pixels ·{" "}
            <strong>{formatBytes(made.blob.size)}</strong>
          </p>
        ) : !error ? (
          <p className="tool-muted">Making the file…</p>
        ) : null}
      </div>
      {made?.aimed != null && (
        <p className="tool-field-hint">
          Aimed for {formatBytes(made.aimed)}, got {formatBytes(made.blob.size)}
          .
        </p>
      )}
      {made?.notes?.map(note => (
        <Notice key={note} tone={made.reached === false ? "warning" : "info"}>
          {note}
        </Notice>
      ))}
      {made?.needs === "webp" && webpOk && (
        <button
          type="button"
          className="tool-button"
          onClick={() =>
            onSettings({
              ...settings,
              format: "webp",
              quality: DEFAULT_QUALITY.webp
            })
          }
        >
          Save as WebP instead (much smaller)
        </button>
      )}
      {made?.needs === "resize" && squeeze.kind === "target" && (
        <button
          type="button"
          className="tool-button"
          onClick={() =>
            onSettings({...settings, squeeze: {...squeeze, allowResize: true}})
          }
        >
          Allow making the picture smaller to reach the size
        </button>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <button
        type="button"
        className="tool-button tool-button-primary"
        disabled={!made}
        onClick={() => made && downloadBlob(made.blob, fileName)}
      >
        <i className="fas fa-download" aria-hidden="true"></i> Download{" "}
        {IMAGE_TYPES[format].label}
      </button>
      <p className="tool-field-hint">
        {lossy
          ? `${IMAGE_TYPES[format].label} saves some detail away to make the file smaller.`
          : "PNG keeps every pixel exactly as shown."}{" "}
        The saved file is a new image: your original isn't changed, and photo
        details such as the camera and location aren't copied into it
        {made?.camera === "kept"
          ? " (except the camera details you chose to keep; never the location)."
          : "."}
      </p>
    </div>
  );
}

/** The worker's compress settings for a Squeeze choice. */
function compressFor(squeeze: Squeeze) {
  if (squeeze.kind === "off") return undefined;
  if (squeeze.kind === "level") {
    return {
      aim: {
        kind: "level" as const,
        level: squeeze.level,
        custom: squeeze.custom
      },
      allowResize: false
    };
  }
  return {
    aim: {kind: "target" as const, bytes: Math.round(squeeze.kb * 1024)},
    allowResize: squeeze.allowResize
  };
}

/* "Make the file smaller": the Smart Image Compressor's levels, or a file
   size to aim for. */
function SqueezeFields({
  squeeze,
  format,
  onChange
}: {
  squeeze: Squeeze;
  format: ImageType;
  onChange: (squeeze: Squeeze) => void;
}) {
  const value =
    squeeze.kind === "level"
      ? squeeze.level
      : squeeze.kind === "target"
      ? "target"
      : "off";
  return (
    <>
      <Field label="Make the file smaller">
        <select
          className="tool-select"
          value={value}
          onChange={e => {
            const v = e.target.value;
            onChange(
              v === "off"
                ? {kind: "off"}
                : v === "target"
                ? {kind: "target", kb: 200, allowResize: false}
                : {kind: "level", level: v as Level, custom: 60}
            );
          }}
        >
          {SQUEEZE_LEVELS.map(l => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>
      {squeeze.kind === "level" && squeeze.level === "custom" && (
        <div className="tool-field">
          <label className="tool-field-label" htmlFor="editor-squeeze-custom">
            Custom quality: {squeeze.custom}
          </label>
          <input
            id="editor-squeeze-custom"
            type="range"
            min={1}
            max={100}
            value={squeeze.custom}
            onChange={e =>
              onChange({...squeeze, custom: Number(e.target.value)})
            }
          />
        </div>
      )}
      {squeeze.kind === "target" && (
        <>
          <div className="tool-field">
            <label className="tool-field-label" htmlFor="editor-squeeze-kb">
              Aim for (KB)
            </label>
            <input
              id="editor-squeeze-kb"
              className="tool-input editor-number"
              inputMode="numeric"
              value={squeeze.kb || ""}
              onChange={e => {
                const kb = Number(
                  e.target.value.replace(/\D/g, "").slice(0, 7)
                );
                onChange({...squeeze, kb: kb || 0});
              }}
            />
          </div>
          {format !== "png" && (
            <label className="editor-checkbox-row">
              <input
                type="checkbox"
                checked={squeeze.allowResize}
                onChange={e =>
                  onChange({...squeeze, allowResize: e.target.checked})
                }
              />
              <span>Allow making the picture smaller to reach it</span>
            </label>
          )}
        </>
      )}
      {squeeze.kind !== "off" && (
        <span className="tool-field-hint">
          {format === "png"
            ? "PNG is made smaller by using fewer colours."
            : "Every try starts from your edited picture, so it is only compressed once."}
        </span>
      )}
    </>
  );
}
