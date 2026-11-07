import React, {useEffect, useState} from "react";
import "../../../shared/ui/Tool.scss";
import {downloadBlob} from "../../../shared/files/download";
import type {ImageType} from "../../../shared/images/header";
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
import {useObjectUrl} from "../../../shared/ui/useObjectUrl";
import {useTask} from "../../../shared/ui/useTask";
import {useWorkerPool} from "../../../shared/ui/useWorkerPool";
import {downloadZip} from "../../../shared/ui/zipDownload";
import type {Level} from "../../../shared/images/compressLevels";
import type {
  CompressSettings,
  SmartImageCompressorApi
} from "../worker/smartImageCompressor.worker";

type Compressed = Awaited<ReturnType<SmartImageCompressorApi["compress"]>>;

const createWorker = () =>
  new Worker(
    new URL("../worker/smartImageCompressor.worker.ts", import.meta.url)
  );

const LEVELS: {value: Level; label: string}[] = [
  {value: "high", label: "High quality"},
  {value: "balanced", label: "Balanced"},
  {value: "small", label: "Small file size"},
  {value: "custom", label: "My own"}
];

function reduction(before: number, after: number): string {
  const percent = Math.round((1 - after / before) * 100);
  return percent > 0 ? `−${percent}%` : "no smaller";
}

/* The original and compressed image side by side. */
function Compare({original, result}: {original: File; result: Compressed}) {
  const before = useObjectUrl(original);
  const after = useObjectUrl(result.blob);
  return (
    <div className="tool-compare">
      <figure>
        {before && <img src={before} alt={`Original: ${original.name}`} />}
        <figcaption>
          Before · {formatBytes(original.size)} · {result.originalWidth} ×{" "}
          {result.originalHeight}
        </figcaption>
      </figure>
      <figure>
        {after && <img src={after} alt={`Compressed: ${result.name}`} />}
        <figcaption>
          After · {formatBytes(result.blob.size)} · {result.width} ×{" "}
          {result.height}
        </figcaption>
      </figure>
    </div>
  );
}

export default function SmartImageCompressor({limits}: {limits: ImageLimits}) {
  const maxMegapixels = isSmallDevice()
    ? limits.maxMegapixelsMobile
    : limits.maxMegapixels;
  const pool = useWorkerPool<SmartImageCompressorApi>(
    createWorker,
    maxMegapixels * 1.5
  );
  const batch = useBatch<PickedImage, Compressed>();
  const clearBatch = batch.clear;
  const task = useTask();
  const [images, setImages] = useState<PickedImage[]>([]);
  const [aimKind, setAimKind] = useState<"level" | "target">("level");
  const [level, setLevel] = useState<Level>("balanced");
  const [custom, setCustom] = useState(70);
  const [target, setTarget] = useState("200");
  const [unit, setUnit] = useState<"KB" | "MB">("KB");
  const [format, setFormat] = useState<ImageType | "same">("same");
  const [background, setBackground] = useState("#ffffff");
  const [webpOk, setWebpOk] = useState(true);
  const [comparing, setComparing] = useState<number | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  useEffect(() => {
    pool.run("canSaveWebp", undefined).then(setWebpOk, () => setWebpOk(false));
  }, [pool]);

  // Images added: get the workers ready while settings are chosen.
  const hasImages = images.length > 0;
  useEffect(() => {
    if (hasImages) pool.warmUp();
  }, [pool, hasImages]);

  const targetNumber = parseFloat(target);
  const targetBytes =
    Number.isFinite(targetNumber) && targetNumber > 0
      ? targetNumber * (unit === "MB" ? 1024 * 1024 : 1024)
      : null;
  const aim: CompressSettings["aim"] | null =
    aimKind === "level"
      ? {kind: "level", level, custom}
      : targetBytes
      ? {kind: "target", bytes: targetBytes}
      : null;
  const makesJpg =
    format === "jpeg" ||
    (format === "same" && images.some(i => i.header.type === "jpeg"));

  useEffect(() => {
    clearBatch();
    setComparing(null);
  }, [
    images,
    aimKind,
    level,
    custom,
    target,
    unit,
    format,
    background,
    clearBatch
  ]);

  const compress = (
    image: PickedImage,
    settings: CompressSettings,
    allowResize: boolean
  ) =>
    pool.run(
      "compress",
      {file: image.file, type: image.header.type, settings, allowResize},
      (2 * image.header.width * image.header.height) / 1e6
    );

  const run = () => {
    if (!aim) return;
    const settings: CompressSettings = {aim, format, background, maxMegapixels};
    void batch.run(images, image => compress(image, settings, false));
  };

  /* Redoes one image after the person agrees to resize or change type. */
  const redo = (image: PickedImage, change: "resize" | "webp") => {
    if (!aim) return;
    const settings: CompressSettings = {
      aim,
      format: change === "webp" ? "webp" : format,
      background,
      maxMegapixels
    };
    void task.run("Working…", async () => {
      batch.update(image.id, {
        status: "done",
        result: await compress(image, settings, change === "resize")
      });
    });
  };

  const done = images.flatMap(image => {
    const state = batch.states.get(image.id);
    return state?.status === "done" ? [{image, result: state.result}] : [];
  });
  const before = done.reduce((sum, d) => sum + d.image.file.size, 0);
  const after = done.reduce((sum, d) => sum + d.result.blob.size, 0);
  const compared = done.find(d => d.image.id === comparing);

  const reset = () => {
    pool.cancel();
    batch.clear();
    task.setError(null);
    setImages([]);
    setComparing(null);
    setPickerKey(k => k + 1);
  };

  return (
    <div className="tool">
      <ToolStep step={1} title="Add your images">
        <ImagePicker
          key={pickerKey}
          id="compressor-input"
          types={["jpeg", "png", "webp"]}
          limits={limits}
          images={images}
          onChange={setImages}
        />
      </ToolStep>

      <ToolStep step={2} title="Choose how small">
        <div className="tool-settings">
          <div className="tool-group">
            <Choice
              label="Aim for"
              value={aimKind}
              onChange={setAimKind}
              options={[
                {value: "level", label: "A quality level"},
                {value: "target", label: "A file size"}
              ]}
            />
            {aimKind === "level" ? (
              <>
                <Choice
                  label="Quality"
                  value={level}
                  onChange={setLevel}
                  options={LEVELS}
                />
                {level === "custom" && (
                  <Field
                    label={`Quality: ${custom}`}
                    hint="Lower makes smaller files. For PNG this sets how many colours are kept."
                  >
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={custom}
                      onChange={e => setCustom(Number(e.target.value))}
                    />
                  </Field>
                )}
              </>
            ) : (
              <>
                <div className="tool-inline">
                  <Field label="Each image at most">
                    <input
                      className="tool-input"
                      inputMode="decimal"
                      value={target}
                      onChange={e =>
                        setTarget(e.target.value.replace(/[^\d.]/g, ""))
                      }
                    />
                  </Field>
                  <Field label="Unit">
                    <select
                      className="tool-select"
                      value={unit}
                      onChange={e => setUnit(e.target.value as "KB" | "MB")}
                    >
                      <option value="KB">KB</option>
                      <option value="MB">MB</option>
                    </select>
                  </Field>
                </div>
                <p className="tool-field-hint">
                  Quality is lowered step by step until each image fits. An
                  exact size can't be promised; if an image can't get small
                  enough, you'll be asked before it's made smaller in size.
                </p>
              </>
            )}
          </div>
          <div className="tool-group">
            <Field
              label="Save as"
              hint={
                webpOk
                  ? "WebP files are usually the smallest."
                  : "This browser can't save WebP images."
              }
            >
              <select
                className="tool-select"
                value={format}
                onChange={e => setFormat(e.target.value as ImageType | "same")}
              >
                <option value="same">Same type as each image</option>
                <option value="jpeg">JPG</option>
                <option value="webp" disabled={!webpOk}>
                  WebP
                </option>
                <option value="png">PNG</option>
              </select>
            </Field>
            {makesJpg && (
              <Field
                label="Background colour"
                hint="Fills see-through areas when saving as JPG."
              >
                <input
                  className="tool-color"
                  type="color"
                  value={background}
                  onChange={e => setBackground(e.target.value)}
                />
              </Field>
            )}
            <p className="tool-field-hint">
              PNG files are made smaller by reducing their number of colours.
              Photo details like camera and location are removed from the saved
              images.
            </p>
          </div>
        </div>
      </ToolStep>

      <ToolStep step={3} title="Compress">
        <ActionBar
          label="Compress images"
          busyLabel={batch.running ? "Compressing…" : null}
          disabled={images.length === 0 || !aim}
          onRun={run}
          onCancel={() => pool.cancel()}
          onReset={reset}
        />
        {images.length === 0 && (
          <p className="tool-muted">Add some images first.</p>
        )}
        {images.length > 0 && !aim && (
          <p className="tool-muted">Type a file size first.</p>
        )}
        {format === "same" &&
          !webpOk &&
          images.some(i => i.header.type === "webp") && (
            <Notice tone="warning">
              This browser can't save WebP images, so choose JPG or PNG to
              compress your WebP images.
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
              ["Compressed", batch.done],
              ["Couldn't compress", batch.failed],
              ["Before", formatBytes(before)],
              ["After", formatBytes(after)],
              ["Saved", before ? reduction(before, after) : "—"]
            ]}
          />
          {compared && (
            <Compare original={compared.image.file} result={compared.result} />
          )}
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
                  warnings={r.notes}
                  details={
                    <>
                      {formatBytes(r.originalSize)} →{" "}
                      <strong>{formatBytes(r.blob.size)}</strong> (
                      {reduction(r.originalSize, r.blob.size)})
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
                  <button
                    type="button"
                    className="tool-button"
                    aria-pressed={comparing === image.id}
                    onClick={() =>
                      setComparing(comparing === image.id ? null : image.id)
                    }
                  >
                    {comparing === image.id ? "Hide comparison" : "Compare"}
                  </button>
                  {r.needs === "resize" && (
                    <button
                      type="button"
                      className="tool-button"
                      onClick={() => redo(image, "resize")}
                      disabled={task.busy !== null}
                    >
                      Make it smaller in size to fit
                    </button>
                  )}
                  {r.needs === "webp" && webpOk && (
                    <button
                      type="button"
                      className="tool-button"
                      onClick={() => redo(image, "webp")}
                      disabled={task.busy !== null}
                    >
                      Save as WebP instead to fit
                    </button>
                  )}
                </ImageCard>
              );
            })}
          </ul>
          {done.length > 1 && !batch.running && (
            <div className="tool-actions-row">
              <button
                type="button"
                className="tool-button tool-button-primary"
                onClick={() =>
                  task.run("Making the ZIP…", () =>
                    downloadZip(
                      done.map(d => ({
                        name: d.result.name,
                        blob: d.result.blob
                      })),
                      "compressed-images.zip",
                      files => pool.run("zip", files)
                    )
                  )
                }
                disabled={task.busy !== null}
              >
                <i className="fas fa-file-archive" aria-hidden="true"></i>{" "}
                {task.busy ?? `Download all (${done.length}) as ZIP`}
              </button>
            </div>
          )}
          {task.error && <Notice tone="error">{task.error}</Notice>}
        </ToolStep>
      )}
    </div>
  );
}
