import React, {useEffect, useState} from "react";
import {baseName, downloadBlob} from "../../../shared/files/download";
import {Notice} from "../../../shared/ui/ToolStep";
import {CancelledError, ToolError} from "../../../shared/worker/WorkerClient";
import type {WorkerClient} from "../../../shared/worker/WorkerClient";
import type {Metadata} from "../logic/exif";
import type {ImageEditorApi} from "../worker/imageEditor.worker";

/** Every detail this tool reads, in the order shown. */
const LABELS = [
  "Camera make",
  "Camera model",
  "Lens",
  "Date taken",
  "Date changed",
  "Software",
  "Orientation",
  "Size recorded",
  "Exposure time",
  "Aperture",
  "ISO",
  "Focal length",
  "Location",
  "Altitude"
];

/* Photo details (EXIF): what the opened file says about the camera, when
   and where it was taken, and its settings, read in this browser. Location
   is shown as numbers only: no map and no link, so it is never sent
   anywhere. The details can be removed from the original file without
   re-saving the picture. */
export function MetadataPanel({
  client,
  fileName
}: {
  client: WorkerClient<ImageEditorApi>;
  fileName: string;
}) {
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<"location" | "all" | null>(null);
  const [clean, setClean] = useState<{
    blob: Blob;
    mode: "location" | "all";
    keptOrientation: boolean;
  } | null>(null);

  useEffect(() => {
    let current = true;
    client.call("metadata", undefined).then(
      m => current && setMeta(m),
      e => current && !(e instanceof CancelledError) && setError(messageOf(e))
    );
    return () => {
      current = false;
    };
  }, [client]);

  const strip = async (mode: "location" | "all") => {
    setWorking(mode);
    setError(null);
    setClean(null);
    try {
      const result = await client.call("stripMetadata", {mode});
      setClean({...result, mode});
    } catch (e) {
      if (!(e instanceof CancelledError)) setError(messageOf(e));
    } finally {
      setWorking(null);
    }
  };

  if (!meta) {
    return (
      <div className="editor-panel-body">
        {error ? (
          <Notice tone="error">{error}</Notice>
        ) : (
          <p className="tool-muted">Reading the photo details…</p>
        )}
      </div>
    );
  }

  const value = (label: string) => {
    const f = meta.fields.find(x => x.label === label);
    return f === undefined ? null : f.value;
  };
  const supported = meta.ranges.container !== null;
  const ext = fileName.includes(".") ? fileName.split(".").pop()! : "jpg";
  const cleanName = `${baseName(fileName)}-clean.${ext}`;

  return (
    <div className="editor-panel-body">
      {!supported ? (
        <Notice tone="info">
          Photo details can be read from JPG, PNG and WebP files. This file type
          doesn't keep camera details in a way this tool can read.
        </Notice>
      ) : meta.status === "none" ? (
        <Notice tone="success">This file has no photo details.</Notice>
      ) : meta.status === "damaged" ? (
        <Notice tone="warning">
          This file's photo details are damaged, so some can't be read. “Remove
          all details” can still take them out.
        </Notice>
      ) : null}

      {supported && meta.status !== "none" && (
        <dl className="editor-meta-list">
          {LABELS.map(label => {
            const v = value(label);
            return (
              <div key={label}>
                <dt>{label}</dt>
                <dd
                  className={v === null || v === "" ? "tool-muted" : undefined}
                >
                  {v === null ? "Not recorded" : v === "" ? "(empty)" : v}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {meta.gps && (
        <Notice tone="warning">
          This photo records where it was taken. Anyone you send the file to can
          see it. Remove the location before sharing.
        </Notice>
      )}
      {meta.hasXmp && (
        <p className="tool-field-hint">
          This file also has XMP details (written by some apps), which can
          include the location too. Both buttons below remove them.
        </p>
      )}

      {supported && meta.status !== "none" && (
        <div className="editor-button-grid">
          <button
            type="button"
            className="tool-button"
            disabled={
              working !== null ||
              meta.status === "damaged" ||
              (!meta.gps && !meta.hasXmp)
            }
            onClick={() => void strip("location")}
          >
            Remove location
          </button>
          <button
            type="button"
            className="tool-button"
            disabled={working !== null}
            onClick={() => void strip("all")}
          >
            Remove all details
          </button>
        </div>
      )}
      {working && <p className="tool-muted">Removing and checking…</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {clean && (
        <>
          <Notice tone="success">
            {clean.mode === "all"
              ? "All the photo details were removed"
              : "The location was removed"}{" "}
            and the file was checked. Same picture quality; only the details
            were removed.
            {clean.keptOrientation &&
              " The turn setting was kept so the photo stays upright."}
          </Notice>
          <button
            type="button"
            className="tool-button tool-button-primary"
            onClick={() => downloadBlob(clean.blob, cleanName)}
          >
            <i className="fas fa-download" aria-hidden="true"></i> Download{" "}
            {cleanName}
          </button>
        </>
      )}

      <p className="tool-field-hint">
        Removing works on the original file you opened, not on your edits, and
        doesn't re-save the picture. It removes EXIF and XMP details (camera,
        dates, settings, location). Colour profiles are kept: they don't say
        anything about you. Files made with Save never include these details,
        unless you choose to keep the camera details for a JPG (the location is
        always left out).
      </p>
    </div>
  );
}

const messageOf = (e: unknown) =>
  e instanceof ToolError ? e.message : "The photo details couldn't be read.";
