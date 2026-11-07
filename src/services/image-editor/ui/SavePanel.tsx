import React, {useEffect, useState} from "react";
import {downloadBlob} from "../../../shared/files/download";
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
}

/** What Save makes: the file, its size, and (for JPG) whether the camera
    details were copied. */
export interface MadeFile {
  blob: Blob;
  width: number;
  height: number;
  camera?: "kept" | "none" | "damaged" | "too-big" | null;
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
            keepCamera
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
  }, [client, edits, format, quality, background, keepCamera, render]);

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

      {lossy && (
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
