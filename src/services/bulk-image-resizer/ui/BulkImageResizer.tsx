import React, {useEffect, useState} from "react";
import "../../../shared/ui/Tool.scss";
import {downloadBlob} from "../../../shared/files/download";
import {IMAGE_TYPES, ImageType} from "../../../shared/images/header";
import {formatBytes, ImageLimits, isSmallDevice} from "../../../shared/limits";
import {ImageCard} from "../../../shared/ui/ImageCard";
import {ImagePicker, PickedImage} from "../../../shared/ui/ImagePicker";
import {ProgressBar} from "../../../shared/ui/ProgressBar";
import {
  ActionBar,
  Choice,
  Field,
  Notice,
  Summary,
  ToolStep
} from "../../../shared/ui/ToolStep";
import {useBatch} from "../../../shared/ui/useBatch";
import {useTask} from "../../../shared/ui/useTask";
import {useWorkerPool} from "../../../shared/ui/useWorkerPool";
import {downloadZip} from "../../../shared/ui/zipDownload";
import {FitMode, planResize, PRESETS, SizeChoice} from "../logic/plan";
import type {BulkImageResizerApi} from "../worker/bulkImageResizer.worker";

type Resized = Awaited<ReturnType<BulkImageResizerApi["resize"]>>;

const createWorker = () =>
  new Worker(new URL("../worker/bulkImageResizer.worker.ts", import.meta.url));

const MODES: {value: FitMode; label: string; hint: string}[] = [
  {
    value: "contain",
    label: "Contain",
    hint: "The whole image fits inside the size. Empty space is filled. Never cropped or distorted."
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

function toNumber(text: string): number | null {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function BulkImageResizer({limits}: {limits: ImageLimits}) {
  const maxMegapixels = isSmallDevice()
    ? limits.maxMegapixelsMobile
    : limits.maxMegapixels;
  const pool = useWorkerPool<BulkImageResizerApi>(
    createWorker,
    maxMegapixels * 1.5
  );
  const batch = useBatch<PickedImage, Resized>();
  const clearBatch = batch.clear;
  const task = useTask();
  const [images, setImages] = useState<PickedImage[]>([]);
  const [sizeChoice, setSizeChoice] = useState("1080x1080");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [percent, setPercent] = useState("50");
  const [mode, setMode] = useState<FitMode>("contain");
  const [format, setFormat] = useState<ImageType | "same">("same");
  const [background, setBackground] = useState("#ffffff");
  const [webpOk, setWebpOk] = useState(true);
  const [pickerKey, setPickerKey] = useState(0);

  useEffect(() => {
    pool.run("canSaveWebp", undefined).then(setWebpOk, () => setWebpOk(false));
  }, [pool]);

  // Images added: get the workers ready while settings are chosen.
  const hasImages = images.length > 0;
  useEffect(() => {
    if (hasImages) pool.warmUp();
  }, [pool, hasImages]);

  let size: SizeChoice | null;
  if (sizeChoice === "percent") {
    const p = toNumber(percent);
    size = p ? {kind: "percent", percent: p} : null;
  } else if (sizeChoice === "custom") {
    const w = toNumber(width);
    const h = toNumber(height);
    size = w || h ? {kind: "box", width: w, height: h} : null;
  } else {
    const [w, h] = sizeChoice.split("x").map(Number);
    size = {kind: "box", width: w!, height: h!};
  }
  const bothSides =
    size?.kind === "box" && size.width !== null && size.height !== null;
  const makesJpg =
    format === "jpeg" ||
    (format === "same" && images.some(i => i.header.type === "jpeg"));

  useEffect(() => {
    clearBatch();
  }, [
    images,
    sizeChoice,
    width,
    height,
    percent,
    mode,
    format,
    background,
    clearBatch
  ]);

  const run = () => {
    if (!size) return;
    const settings = {size, mode, format, background, maxMegapixels};
    const chosen = size;
    void batch.run(images, image => {
      // Memory weight: the decoded original plus the new image, in megapixels.
      const {width: w, height: h, type} = image.header;
      const out = planResize(w, h, chosen, mode);
      const weight = (w * h + out.width * out.height) / 1e6;
      return pool.run("resize", {file: image.file, type, settings}, weight);
    });
  };

  const results = images.flatMap(image => {
    const state = batch.states.get(image.id);
    return state?.status === "done"
      ? [{name: state.result.name, blob: state.result.blob}]
      : [];
  });

  const reset = () => {
    pool.cancel();
    batch.clear();
    task.setError(null);
    setImages([]);
    setPickerKey(k => k + 1);
  };

  return (
    <div className="tool">
      <ToolStep step={1} title="Add your images">
        <ImagePicker
          key={pickerKey}
          id="resizer-input"
          types={["jpeg", "png", "webp"]}
          limits={limits}
          images={images}
          onChange={setImages}
        />
      </ToolStep>

      <ToolStep step={2} title="Choose the new size">
        <div className="tool-settings">
          <div className="tool-group">
            <Field label="Size">
              <select
                className="tool-select"
                value={sizeChoice}
                onChange={e => setSizeChoice(e.target.value)}
              >
                {PRESETS.map(p => (
                  <option key={p.label} value={`${p.width}x${p.height}`}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom size…</option>
                <option value="percent">A percentage of the original…</option>
              </select>
            </Field>
            {sizeChoice === "custom" && (
              <>
                <div className="tool-inline">
                  <Field label="Width (pixels)">
                    <input
                      className="tool-input"
                      inputMode="numeric"
                      value={width}
                      onChange={e =>
                        setWidth(e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </Field>
                  <Field label="Height (pixels)">
                    <input
                      className="tool-input"
                      inputMode="numeric"
                      value={height}
                      onChange={e =>
                        setHeight(e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </Field>
                </div>
                <p className="tool-field-hint">
                  Leave one empty to keep each image's shape.
                </p>
              </>
            )}
            {sizeChoice === "percent" && (
              <Field
                label="Percentage"
                hint="50 makes images half as wide and half as tall."
              >
                <input
                  className="tool-input tool-input-short"
                  inputMode="numeric"
                  value={percent}
                  onChange={e => setPercent(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            )}
          </div>
          {bothSides && (
            <div className="tool-group">
              <Choice
                label="How images fit the size"
                value={mode}
                onChange={setMode}
                options={MODES}
              />
              <p className="tool-field-hint">
                {MODES.find(m => m.value === mode)!.hint}
              </p>
            </div>
          )}
          <div className="tool-group">
            <Field
              label="Save as"
              hint={webpOk ? undefined : "This browser can't save WebP images."}
            >
              <select
                className="tool-select"
                value={format}
                onChange={e => setFormat(e.target.value as ImageType | "same")}
              >
                <option value="same">Same type as each image</option>
                <option value="jpeg">JPG</option>
                <option value="png">PNG</option>
                <option value="webp" disabled={!webpOk}>
                  WebP
                </option>
              </select>
            </Field>
            {makesJpg &&
              (bothSides && mode === "contain" ? true : format === "jpeg") && (
                <Field
                  label="Background colour"
                  hint="Fills empty space and see-through areas in JPG images. PNG and WebP stay see-through."
                >
                  <input
                    className="tool-color"
                    type="color"
                    value={background}
                    onChange={e => setBackground(e.target.value)}
                  />
                </Field>
              )}
          </div>
        </div>
      </ToolStep>

      <ToolStep step={3} title="Resize">
        <ActionBar
          label="Resize images"
          busyLabel={batch.running ? "Resizing…" : null}
          disabled={images.length === 0 || !size}
          onRun={run}
          onCancel={() => pool.cancel()}
          onReset={reset}
        />
        {images.length === 0 && (
          <p className="tool-muted">Add some images first.</p>
        )}
        {images.length > 0 && !size && (
          <p className="tool-muted">Type a size first.</p>
        )}
        {format === "same" &&
          !webpOk &&
          images.some(i => i.header.type === "webp") && (
            <Notice tone="warning">
              This browser can't save WebP images, so choose JPG or PNG to
              resize your WebP images.
            </Notice>
          )}
        {batch.total > 0 && (
          <ProgressBar
            done={batch.done + batch.failed}
            total={batch.total}
            label="Images finished"
          />
        )}
      </ToolStep>

      {batch.total > 0 && (
        <ToolStep step={4} title="Result">
          <Summary
            items={[
              ["Resized", batch.done],
              ["Couldn't resize", batch.failed]
            ]}
          />
          <ul className="tool-image-list">
            {images.map(image => {
              const state = batch.states.get(image.id);
              if (!state) return null;
              if (state.status === "failed") {
                return (
                  <ImageCard
                    key={image.id}
                    preview={null}
                    name={image.file.name}
                    error={state.message}
                  />
                );
              }
              // Cards appear as images finish; the progress bar shows the rest.
              if (state.status === "waiting") return null;
              const r = state.result;
              return (
                <ImageCard
                  key={image.id}
                  preview={r.thumb}
                  name={r.name}
                  warnings={r.warnings}
                  details={
                    <>
                      {r.originalWidth} × {r.originalHeight} →{" "}
                      <strong>
                        {r.width} × {r.height}
                      </strong>{" "}
                      · {formatBytes(r.blob.size)}{" "}
                      {IMAGE_TYPES[image.header.type].mime !== r.blob.type
                        ? `(${r.name.split(".").pop()!.toUpperCase()})`
                        : ""}
                    </>
                  }
                >
                  <button
                    type="button"
                    className="tool-button"
                    onClick={() => downloadBlob(r.blob, r.name)}
                  >
                    <i className="fas fa-download" aria-hidden="true"></i>{" "}
                    Download
                  </button>
                </ImageCard>
              );
            })}
          </ul>
          {results.length > 1 && !batch.running && (
            <div className="tool-actions-row">
              <button
                type="button"
                className="tool-button tool-button-primary"
                onClick={() =>
                  task.run("Making the ZIP…", () =>
                    downloadZip(results, "resized-images.zip", files =>
                      pool.run("zip", files)
                    )
                  )
                }
                disabled={task.busy !== null}
              >
                <i className="fas fa-file-archive" aria-hidden="true"></i>{" "}
                {task.busy ?? `Download all (${results.length}) as ZIP`}
              </button>
            </div>
          )}
          {task.error && <Notice tone="error">{task.error}</Notice>}
        </ToolStep>
      )}
    </div>
  );
}
