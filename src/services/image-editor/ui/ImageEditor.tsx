import React, {useCallback, useEffect, useRef, useState} from "react";
import "../../../shared/ui/Tool.scss";
import "./ImageEditor.scss";
import {baseName} from "../../../shared/files/download";
import {
  INPUT_TYPES,
  InputType,
  isImageType,
  readFileInputHeader
} from "../../../shared/images/header";
import {
  EditorLimits,
  fileLimitMB,
  formatBytes,
  isSmallDevice
} from "../../../shared/limits";
import {formatCount} from "../../../shared/text/numbers";
import {DropZone} from "../../../shared/ui/DropZone";
import {Notice} from "../../../shared/ui/ToolStep";
import {useWorker} from "../../../shared/ui/useWorker";
import {ToolError} from "../../../shared/worker/WorkerClient";
import {
  addsEmptyAreas,
  Edits,
  NO_EDITS,
  NO_TRANSFORM,
  sameEdits,
  transformedSize
} from "../logic/edits";
import {commit, History, redo, start, undo} from "../logic/history";
import type {ImageEditorApi} from "../worker/imageEditor.worker";
import {DEFAULT_QUALITY, SavePanel, SaveSettings} from "./SavePanel";
import {TransformPanel} from "./TransformPanel";
import {Workspace, Zoom, ZOOM_STEPS} from "./Workspace";

const createWorker = () =>
  new Worker(new URL("../worker/imageEditor.worker.ts", import.meta.url));

const MB = 1024 * 1024;

const TOOLS = [
  {id: "transform", label: "Rotate & flip", icon: "fas fa-sync-alt"},
  {id: "save", label: "Save", icon: "fas fa-download"}
] as const;
type ToolId = (typeof TOOLS)[number]["id"];

const ALL_EXTENSIONS = Object.values(INPUT_TYPES).flatMap(t => t.exts);
const TYPE_NAMES = "JPG, PNG, WebP, GIF, BMP or AVIF";

interface OpenImage {
  file: File;
  type: InputType;
  width: number;
  height: number;
  seeThrough: boolean;
}

export default function ImageEditor({limits}: {limits: EditorLimits}) {
  const small = isSmallDevice();
  const maxMB = fileLimitMB(limits);
  const maxMP = small ? limits.maxMegapixelsMobile : limits.maxMegapixels;

  const client = useWorker<ImageEditorApi>(createWorker);
  const [image, setImage] = useState<OpenImage | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [history, setHistory] = useState<History<Edits>>(start(NO_EDITS));
  /** A change being made with a slider, not yet recorded. */
  const [draft, setDraft] = useState<Edits | null>(null);
  const [tool, setTool] = useState<ToolId>("transform");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fitScale, setFitScale] = useState(1);
  const [showOriginal, setShowOriginal] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [webpOk, setWebpOk] = useState(true);
  const [save, setSave] = useState<SaveSettings>({
    format: "jpeg",
    quality: DEFAULT_QUALITY.jpeg,
    background: "#ffffff",
    name: "image"
  });
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    client
      .call("canSaveWebp", undefined)
      .then(setWebpOk, () => setWebpOk(false));
  }, [client]);

  const edits = draft ?? history.present;
  const shown = showOriginal ? NO_EDITS : edits;
  const edited = !sameEdits(history.present, NO_EDITS);

  const change = useCallback((next: Edits) => {
    setHistory(h => commit(h, next, sameEdits));
    setDraft(null);
    setShowOriginal(false);
  }, []);
  const back = useCallback(() => {
    setDraft(null);
    setHistory(undo);
  }, []);
  const forward = useCallback(() => {
    setDraft(null);
    setHistory(redo);
  }, []);

  // Ctrl+Z / Cmd+Z to undo; with Shift (or Ctrl+Y) to redo.
  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement;
      if (target.matches("textarea, input:not([type=range]):not([type=color])"))
        return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) back();
      else if (key === "y" || (key === "z" && e.shiftKey)) forward();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [image, back, forward]);

  const open = async (file: File) => {
    if (
      image &&
      edited &&
      !window.confirm(
        "Open another image? The changes to this one haven't been saved."
      )
    )
      return;
    setOpenError(null);
    const checked = await checkFile(file, maxMB, maxMP);
    if (typeof checked === "string") {
      setOpenError(checked);
      return;
    }
    setOpening(true);
    try {
      const info = await client.call("open", {
        file,
        type: checked.type,
        limit: maxMP
      });
      setImage({file, type: checked.type, ...info});
      setHistory(start(NO_EDITS));
      setDraft(null);
      setZoom("fit");
      setShowOriginal(false);
      setTool("transform");
      // Saved as the same type by default (PNG for types it can't save).
      const same = isImageType(checked.type) ? checked.type : "png";
      const format = same === "webp" && !webpOk ? "png" : same;
      setSave(old => ({
        ...old,
        format,
        quality: DEFAULT_QUALITY[format],
        name: `${baseName(file.name)}-edited`
      }));
    } catch (e) {
      setImage(null);
      setOpenError(
        e instanceof ToolError
          ? e.message
          : `“${file.name}” couldn't be opened. Try another image.`
      );
    } finally {
      setOpening(false);
    }
  };

  const picker = (
    <input
      ref={fileInput}
      id="editor-open-file"
      type="file"
      hidden
      accept={ALL_EXTENSIONS.map(ext => `.${ext}`).join(",")}
      onChange={e => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void open(file);
      }}
    />
  );

  if (!image) {
    return (
      <div className="editor editor-empty">
        <DropZone
          inputId="editor-files"
          accept={ALL_EXTENSIONS}
          multiple={false}
          hint={`${TYPE_NAMES} · up to ${maxMB} MB and ${maxMP} megapixels`}
          onFiles={files => void open(files[0]!)}
        />
        {opening && (
          <p className="tool-muted" role="status">
            Opening the image…
          </p>
        )}
        {openError && <Notice tone="error">{openError}</Notice>}
      </div>
    );
  }

  const out = transformedSize(image.width, image.height, shown.transform);
  const display = zoom === "fit" ? fitScale : zoom / 100;
  const zoomBy = (direction: 1 | -1) => {
    const now = Math.round(display * 100);
    const next =
      direction > 0
        ? ZOOM_STEPS.find(step => step > now)
        : [...ZOOM_STEPS].reverse().find(step => step < now);
    if (next) setZoom(next);
  };
  const toolLabel = TOOLS.find(t => t.id === tool)!.label;

  return (
    <div className="editor">
      {picker}
      <div className="editor-topbar">
        <span className="editor-file" title={image.file.name}>
          <i className="fas fa-image" aria-hidden="true"></i> {image.file.name}
        </span>
        <div className="editor-topbar-actions">
          <button
            type="button"
            className="tool-button"
            onClick={() => fileInput.current?.click()}
          >
            <i className="fas fa-folder-open" aria-hidden="true"></i> Open image
          </button>
          <button
            type="button"
            className="tool-button"
            disabled={history.past.length === 0}
            onClick={back}
            title="Undo (Ctrl+Z)"
          >
            <i className="fas fa-undo" aria-hidden="true"></i> Undo
          </button>
          <button
            type="button"
            className="tool-button"
            disabled={history.future.length === 0}
            onClick={forward}
            title="Redo (Ctrl+Shift+Z)"
          >
            <i className="fas fa-redo" aria-hidden="true"></i> Redo
          </button>
          <button
            type="button"
            className="tool-button"
            disabled={!edited}
            onClick={() => change(NO_EDITS)}
          >
            Reset all
          </button>
          <button
            type="button"
            className="tool-button tool-button-primary"
            onClick={() => setTool("save")}
          >
            <i className="fas fa-download" aria-hidden="true"></i> Save
          </button>
        </div>
      </div>
      {openError && <Notice tone="error">{openError}</Notice>}

      <div className="editor-main">
        <nav className="editor-tools" aria-label="Tools">
          {TOOLS.map(t => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tool === t.id}
              onClick={() => setTool(t.id)}
            >
              <i className={t.icon} aria-hidden="true"></i>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <section className="editor-workspace" aria-label="Image">
          <div className="editor-workspace-bar">
            <div className="editor-zoom" role="group" aria-label="Zoom">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => zoomBy(-1)}
                disabled={display <= ZOOM_STEPS[0]! / 100}
              >
                <i className="fas fa-search-minus" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                aria-pressed={zoom === "fit"}
                onClick={() => setZoom("fit")}
              >
                Fit
              </button>
              <button
                type="button"
                aria-pressed={zoom === 100}
                onClick={() => setZoom(100)}
              >
                100%
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => zoomBy(1)}
                disabled={display >= ZOOM_STEPS[ZOOM_STEPS.length - 1]! / 100}
              >
                <i className="fas fa-search-plus" aria-hidden="true"></i>
              </button>
            </div>
            <button
              type="button"
              className="editor-compare"
              aria-pressed={showOriginal}
              disabled={!edited}
              onClick={() => setShowOriginal(v => !v)}
            >
              <i className="fas fa-eye" aria-hidden="true"></i>{" "}
              {showOriginal ? "Showing the original" : "Show the original"}
            </button>
          </div>
          <Workspace
            client={client}
            edits={shown}
            width={out.width}
            height={out.height}
            zoom={zoom}
            onFitScale={setFitScale}
            onBusy={setDrawing}
          />
        </section>

        <aside className="editor-panel" aria-labelledby="editor-panel-title">
          <h2 id="editor-panel-title">{toolLabel}</h2>
          {tool === "transform" && (
            <TransformPanel
              transform={edits.transform}
              onChange={transform => change({...edits, transform})}
              onPreview={transform => setDraft({...edits, transform})}
              onReset={() => change({...edits, transform: NO_TRANSFORM})}
            />
          )}
          {tool === "save" && (
            <SavePanel
              client={client}
              edits={history.present}
              settings={save}
              onSettings={setSave}
              webpOk={webpOk}
              seeThrough={image.seeThrough || addsEmptyAreas(history.present)}
            />
          )}
        </aside>
      </div>

      <dl className="editor-status">
        <div>
          <dt>Original</dt>
          <dd>
            {formatCount(image.width)} × {formatCount(image.height)}{" "}
            {INPUT_TYPES[image.type].label}, {formatBytes(image.file.size)}
          </dd>
        </div>
        <div>
          <dt>{showOriginal ? "Showing" : "Result"}</dt>
          <dd>
            {formatCount(out.width)} × {formatCount(out.height)}
          </dd>
        </div>
        <div>
          <dt>Zoom</dt>
          <dd>{Math.round(display * 100)}%</dd>
        </div>
        <div>
          <dt>Tool</dt>
          <dd>{toolLabel}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{opening ? "Opening…" : drawing ? "Updating…" : "Ready"}</dd>
        </div>
      </dl>
    </div>
  );
}

/* Checks a file before opening it: empty, too big, not an image this tool
   can open, or too many pixels. Returns the problem, or the file's type. */
async function checkFile(
  file: File,
  maxMB: number,
  maxMP: number
): Promise<string | {type: InputType}> {
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > maxMB * MB) {
    return `“${file.name}” is ${formatBytes(
      file.size
    )}; this device can edit images up to ${maxMB} MB.`;
  }
  const header = await readFileInputHeader(file).catch(() => null);
  if (!header) {
    return `“${file.name}” isn't a ${TYPE_NAMES} image (or it's damaged).`;
  }
  const megapixels = (header.width * header.height) / 1e6;
  if (megapixels > maxMP) {
    return `“${file.name}” is ${formatCount(header.width)} × ${formatCount(
      header.height
    )} pixels (${megapixels.toFixed(
      0
    )} megapixels); this device can edit images up to ${maxMP} megapixels. Make it smaller with the Bulk Image Resizer first.`;
  }
  return {type: header.type};
}
