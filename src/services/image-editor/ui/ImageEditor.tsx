import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import "../../../shared/ui/Tool.scss";
import "./ImageEditor.scss";
import {baseName} from "../../../shared/files/download";
import {MAX_SIDE} from "../../../shared/images/canvas";
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
  Crop,
  Edits,
  NO_ADJUST,
  NO_EDITS,
  NO_EFFECTS,
  NO_FRAME,
  NO_REDACTIONS,
  NO_TRANSFORM,
  noticeForEarlierChange,
  previewEditsFor,
  resultSize,
  sameEdits,
  transformedSize,
  withEarlierChange
} from "../logic/edits";
import type {Rgba} from "../logic/colour";
import {Size} from "../logic/geometry";
import {commit, History, redo, start, undo} from "../logic/history";
import type {ImageEditorApi} from "../worker/imageEditor.worker";
import {AdjustPanel} from "./AdjustPanel";
import {BoxEditor} from "./BoxEditor";
import {checkFile, TYPE_NAMES} from "./checkFile";
import {CollageMode} from "./CollageMode";
import {CropDraft, CropPanel, ratioOf} from "./CropPanel";
import {EffectsPanel} from "./EffectsPanel";
import {FramePanel} from "./FramePanel";
import {MetadataPanel} from "./MetadataPanel";
import {PickerOverlay} from "./PickerOverlay";
import {addRecent, PickerPanel} from "./PickerPanel";
import {RedactOverlay} from "./RedactOverlay";
import {newRedaction, RedactPanel} from "./RedactPanel";
import {DEFAULT_QUALITY, SavePanel, SaveSettings} from "./SavePanel";
import {TransformPanel} from "./TransformPanel";
import {Workspace, Zoom, ZOOM_STEPS} from "./Workspace";
import {WatermarkOverlay} from "./WatermarkOverlay";
import {LogoInfo, WatermarkPanel} from "./WatermarkPanel";

const createWorker = () =>
  new Worker(new URL("../worker/imageEditor.worker.ts", import.meta.url));

const MB = 1024 * 1024;
const MAX_LOGO_MB = 10;
const MAX_LOGO_MEGAPIXELS = 16;

const TOOLS = [
  {id: "crop", label: "Crop", icon: "fas fa-crop-alt"},
  {id: "transform", label: "Rotate & flip", icon: "fas fa-sync-alt"},
  {id: "adjust", label: "Colour adjust", icon: "fas fa-sliders-h"},
  {id: "effects", label: "Effects", icon: "fas fa-magic"},
  {id: "redact", label: "Hide areas", icon: "fas fa-eye-slash"},
  {id: "watermark", label: "Watermark", icon: "fas fa-stamp"},
  {id: "frame", label: "Border & padding", icon: "fas fa-border-all"},
  {id: "picker", label: "Colour picker", icon: "fas fa-eye-dropper"},
  {id: "metadata", label: "Photo details", icon: "fas fa-info-circle"},
  {id: "save", label: "Save", icon: "fas fa-download"}
] as const;
type ToolId = (typeof TOOLS)[number]["id"];

const ALL_EXTENSIONS = Object.values(INPUT_TYPES).flatMap(t => t.exts);

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
  const [notice, setNotice] = useState<string | null>(null);
  /** The crop box being edited, for the image size and crop it was made
      for; it's dropped when either changes (turning, Undo...). */
  const [cropDraft, setCropDraft] = useState<
    (CropDraft & {key: string}) | null
  >(null);
  /** Logos open in the worker, by id (for logo watermarks). */
  const [logos, setLogos] = useState<ReadonlyMap<string, LogoInfo>>(new Map());
  const [logoError, setLogoError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveSettings>({
    format: "jpeg",
    quality: DEFAULT_QUALITY.jpeg,
    background: "#ffffff",
    name: "image"
  });
  const fileInput = useRef<HTMLInputElement>(null);
  /** "Edit one image" or "Make a collage". */
  const [mode, setMode] = useState<"edit" | "collage">("edit");
  const [collageCount, setCollageCount] = useState(0);
  /** Whether the opened file has camera details that Save could keep. */
  const [hasCamera, setHasCamera] = useState(false);
  // Colour picker: the picked colour, recent ones, and the main colours.
  const [pickerReady, setPickerReady] = useState(false);
  const [picked, setPicked] = useState<Rgba | null>(null);
  const [recent, setRecent] = useState<Rgba[]>([]);
  const [mainColours, setMainColours] = useState<string[] | null>(null);

  useEffect(() => {
    client
      .call("canSaveWebp", undefined)
      .then(setWebpOk, () => setWebpOk(false));
  }, [client]);

  const edits = draft ?? history.present;
  const shown = showOriginal ? NO_EDITS : edits;
  const edited = !sameEdits(history.present, NO_EDITS);
  const workspaceEdits = useMemo(
    () => previewEditsFor(tool, shown),
    [tool, shown]
  );

  const present = useRef(history.present);
  present.current = history.present;
  const change = useCallback((next: Edits) => {
    setNotice(noticeForEarlierChange(present.current, next));
    setHistory(h => commit(h, withEarlierChange(h.present, next), sameEdits));
    setDraft(null);
    setShowOriginal(false);
  }, []);
  const back = useCallback(() => {
    setDraft(null);
    setNotice(null);
    setHistory(undo);
  }, []);
  const forward = useCallback(() => {
    setDraft(null);
    setNotice(null);
    setHistory(redo);
  }, []);

  // Ctrl+Z / Cmd+Z to undo; with Shift (or Ctrl+Y) to redo.
  useEffect(() => {
    if (!image || mode !== "edit") return;
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
  }, [image, mode, back, forward]);

  // The colour picker reads from the edited image at full size, drawn once
  // when the tool opens (and again after Undo or Redo).
  const pickFrom = history.present;
  const picking = tool === "picker" && mode === "edit" && image !== null;
  useEffect(() => {
    if (!picking) return;
    let current = true;
    setMainColours(null);
    client.call("pickerStart", {edits: pickFrom}).then(
      () => current && setPickerReady(true),
      () => current && setPickerReady(false)
    );
    return () => {
      current = false;
      setPickerReady(false);
      client.call("pickerEnd", undefined).catch(() => undefined);
    };
  }, [picking, pickFrom, client]);

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
      setNotice(null);
      setCropDraft(null);
      // The worker closes the logos when a new image opens.
      setLogos(new Map());
      setLogoError(null);
      setPicked(null);
      setRecent([]);
      setMainColours(null);
      setHasCamera(false);
      client.call("metadata", undefined).then(
        m => setHasCamera(m.ranges.tiff !== null && m.status === "found"),
        () => setHasCamera(false)
      );
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

  /** Opens a picture for a logo watermark and uses it. */
  const pickLogo = async (file: File) => {
    setLogoError(null);
    const problem =
      file.size === 0
        ? `“${file.name}” is empty.`
        : file.size > MAX_LOGO_MB * MB
        ? `“${file.name}” is too big for a logo. Use a picture up to ${MAX_LOGO_MB} MB.`
        : null;
    const header = problem
      ? null
      : await readFileInputHeader(file).catch(() => null);
    if (problem || !header) {
      setLogoError(
        problem ??
          `“${file.name}” isn't a ${TYPE_NAMES} image (or it's damaged).`
      );
      return;
    }
    if ((header.width * header.height) / 1e6 > MAX_LOGO_MEGAPIXELS) {
      setLogoError(
        `“${file.name}” has too many pixels for a logo. Use a picture up to ${MAX_LOGO_MEGAPIXELS} megapixels.`
      );
      return;
    }
    try {
      const opened = await client.call("openLogo", {file});
      setLogos(old => {
        const next = new Map(old);
        opened.evicted.forEach(id => next.delete(id));
        next.set(opened.logoId, {
          name: file.name,
          width: opened.width,
          height: opened.height
        });
        return next;
      });
      const base = present.current.watermark;
      if (base)
        change({
          ...present.current,
          watermark: {...base, kind: "logo", logoId: opened.logoId}
        });
    } catch (e) {
      setLogoError(
        e instanceof ToolError
          ? e.message
          : `“${file.name}” couldn't be opened. Try another picture.`
      );
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

  const modeSwitch = (
    <div className="editor-modes" role="group" aria-label="What to make">
      {(
        [
          ["edit", "Edit one image", "fas fa-image"],
          ["collage", "Make a collage", "fas fa-th-large"]
        ] as const
      ).map(([id, label, icon]) => (
        <button
          key={id}
          type="button"
          aria-pressed={mode === id}
          onClick={() => {
            if (
              mode === "collage" &&
              id === "edit" &&
              collageCount > 0 &&
              !window.confirm(
                "Leave the collage? Its pictures will be cleared (your image edits are kept)."
              )
            )
              return;
            setMode(id);
          }}
        >
          <i className={icon} aria-hidden="true"></i> {label}
        </button>
      ))}
    </div>
  );

  if (mode === "collage") {
    return (
      <div className="editor">
        {modeSwitch}
        <CollageMode
          client={client}
          maxMB={maxMB}
          maxMP={maxMP}
          maxItems={small ? 12 : 25}
          webpOk={webpOk}
          onCount={setCollageCount}
        />
      </div>
    );
  }

  if (!image) {
    return (
      <div className="editor editor-empty">
        {modeSwitch}
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

  const turned = transformedSize(image.width, image.height, shown.transform);
  const cropped = shown.crop
    ? {width: shown.crop.width, height: shown.crop.height}
    : turned;
  const out = resultSize(image.width, image.height, shown);
  // The hidden areas and the watermark are placed on the image without its
  // border and padding (which their tools don't show).
  const unframed = resultSize(image.width, image.height, {
    ...shown,
    frame: NO_FRAME
  });
  const workspaceSize =
    tool === "crop"
      ? turned
      : tool === "redact" || tool === "watermark"
      ? unframed
      : out;
  const layer = resultSize(image.width, image.height, {
    ...edits,
    frame: NO_FRAME
  });
  const redactions = edits.redactions ?? NO_REDACTIONS;

  // The crop box works on the image being edited (never the original).
  const cropBounds = transformedSize(
    image.width,
    image.height,
    edits.transform
  );
  const cropKey = keyFor(cropBounds, edits.crop ?? null);
  const crop: CropDraft =
    cropDraft && cropDraft.key === cropKey
      ? cropDraft
      : edits.crop
      ? {
          box: {
            x: edits.crop.x,
            y: edits.crop.y,
            width: edits.crop.width,
            height: edits.crop.height
          },
          shape: edits.crop.shape,
          preset: edits.crop.shape === "circle" ? "1:1" : "free"
        }
      : {
          box: {x: 0, y: 0, width: cropBounds.width, height: cropBounds.height},
          shape: "rect",
          preset: "free"
        };
  const editCrop = (next: CropDraft) => setCropDraft({...next, key: cropKey});

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
      {modeSwitch}
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
            onClick={() => {
              change(NO_EDITS);
              setCropDraft(null);
            }}
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
      {notice && <Notice tone="warning">{notice}</Notice>}

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
            edits={workspaceEdits}
            width={workspaceSize.width}
            height={workspaceSize.height}
            zoom={zoom}
            onFitScale={setFitScale}
            onBusy={setDrawing}
          >
            {tool === "redact" && !showOriginal && (
              <RedactOverlay
                redactions={redactions}
                imageSize={layer}
                scale={display}
                onDraw={area =>
                  change({
                    ...edits,
                    redactions: [...redactions, newRedaction(redactions, area)]
                  })
                }
                onChange={next => change({...edits, redactions: next})}
                onPreview={next => setDraft({...edits, redactions: next})}
              />
            )}
            {tool === "watermark" && !showOriginal && edits.watermark && (
              <WatermarkOverlay
                watermark={edits.watermark}
                imageSize={layer}
                scale={display}
                logo={
                  edits.watermark.logoId
                    ? logos.get(edits.watermark.logoId)
                    : undefined
                }
                onChange={watermark => change({...edits, watermark})}
                onPreview={watermark => setDraft({...edits, watermark})}
              />
            )}
            {tool === "picker" && pickerReady && !showOriginal && (
              <PickerOverlay
                imageSize={out}
                scale={display}
                sample={(x, y) => client.call("sample", {x, y})}
                onPick={s => {
                  setPicked(s.rgba);
                  setRecent(old => addRecent(old, s.rgba));
                }}
              />
            )}
            {tool === "crop" && !showOriginal && (
              <BoxEditor
                box={crop.box}
                imageSize={cropBounds}
                scale={display}
                aspectRatio={ratioOf(crop.preset)}
                shape={crop.shape}
                ariaLabel="Crop area"
                onChange={box => editCrop({...crop, box})}
              />
            )}
          </Workspace>
        </section>

        <aside className="editor-panel" aria-labelledby="editor-panel-title">
          <h2 id="editor-panel-title">{toolLabel}</h2>
          {tool === "crop" && (
            <CropPanel
              imageSize={cropBounds}
              draft={crop}
              onDraft={editCrop}
              onApply={applied => {
                // A rectangle covering the whole image crops nothing.
                const next: Crop | null =
                  applied.shape === "rect" &&
                  applied.width === cropBounds.width &&
                  applied.height === cropBounds.height
                    ? null
                    : applied;
                change({...edits, crop: next});
                setCropDraft({...crop, key: keyFor(cropBounds, next)});
              }}
              onReset={() => {
                change({...edits, crop: null});
                setCropDraft(null);
              }}
            />
          )}
          {tool === "transform" && (
            <TransformPanel
              transform={edits.transform}
              onChange={transform => change({...edits, transform})}
              onPreview={transform => setDraft({...edits, transform})}
              onReset={() => change({...edits, transform: NO_TRANSFORM})}
            />
          )}
          {tool === "adjust" && (
            <AdjustPanel
              adjust={edits.adjust ?? NO_ADJUST}
              onChange={adjust => change({...edits, adjust})}
              onPreview={adjust => setDraft({...edits, adjust})}
            />
          )}
          {tool === "effects" && (
            <EffectsPanel
              effects={edits.effects ?? NO_EFFECTS}
              onChange={effects => change({...edits, effects})}
              onPreview={effects => setDraft({...edits, effects})}
            />
          )}
          {tool === "redact" && (
            <RedactPanel
              redactions={redactions}
              onChange={next => change({...edits, redactions: next})}
              onPreview={next => setDraft({...edits, redactions: next})}
            />
          )}
          {tool === "watermark" && (
            <WatermarkPanel
              watermark={edits.watermark ?? null}
              logos={logos}
              logoError={logoError}
              onChange={watermark => change({...edits, watermark})}
              onPreview={watermark => setDraft({...edits, watermark})}
              onPickLogo={file => void pickLogo(file)}
            />
          )}
          {tool === "frame" && (
            <FramePanel
              frame={edits.frame ?? NO_FRAME}
              currentWidth={cropped.width}
              currentHeight={cropped.height}
              maxSide={MAX_SIDE}
              maxMegapixels={maxMP}
              onChange={frame => change({...edits, frame})}
              onPreview={frame => setDraft({...edits, frame})}
              onReset={() => change({...edits, frame: NO_FRAME})}
            />
          )}
          {tool === "picker" && (
            <PickerPanel
              picked={picked}
              recent={recent}
              palette={mainColours}
              onSelect={setPicked}
              onClearRecent={() => setRecent([])}
              onFindPalette={() =>
                client
                  .call("palette", undefined)
                  .then(setMainColours, () => setMainColours([]))
              }
              onRemoveFromPalette={hex =>
                setMainColours(old => old?.filter(x => x !== hex) ?? null)
              }
            />
          )}
          {tool === "metadata" && (
            <MetadataPanel client={client} fileName={image.file.name} />
          )}
          {tool === "save" && (
            <SavePanel
              client={client}
              edits={history.present}
              settings={save}
              onSettings={setSave}
              webpOk={webpOk}
              seeThrough={image.seeThrough || addsEmptyAreas(history.present)}
              sourceType={image.type}
              hasCameraDetails={hasCamera}
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

/** Which image size and crop a crop draft belongs to. */
const keyFor = (bounds: Size, crop: Crop | null) =>
  JSON.stringify([bounds.width, bounds.height, crop]);
