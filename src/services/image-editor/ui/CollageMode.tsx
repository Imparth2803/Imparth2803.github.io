import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {MAX_SIDE} from "../../../shared/images/canvas";
import {INPUT_TYPES} from "../../../shared/images/header";
import {formatCount} from "../../../shared/text/numbers";
import {DropZone} from "../../../shared/ui/DropZone";
import {Field, Notice} from "../../../shared/ui/ToolStep";
import {CancelledError, ToolError} from "../../../shared/worker/WorkerClient";
import type {WorkerClient} from "../../../shared/worker/WorkerClient";
import {baseName} from "../../../shared/files/download";
import {CollageLayout, LAYOUTS, planCollage} from "../logic/collage";
import type {ImageEditorApi} from "../worker/imageEditor.worker";
import type {CollageSettings} from "../worker/collage";
import {checkFile, TYPE_NAMES} from "./checkFile";
import {ColourInput} from "./ColourInput";
import {
  DEFAULT_QUALITY,
  RenderFile,
  SavePanel,
  SaveSettings
} from "./SavePanel";
import {FieldGroup} from "./FieldGroup";

interface Item {
  id: number;
  file: File;
  name: string;
  width: number;
  height: number;
  thumbUrl: string;
  caption: string;
}

const ALL_EXTENSIONS = Object.values(INPUT_TYPES).flatMap(t => t.exts);
const PREVIEW_SIDE = 2048;
const CAPTION_PCT = 12;

/* Make a collage: several pictures in one image. It has its own list of
   pictures and settings (it isn't part of the single-image edits or their
   Undo). Pictures are opened one at a time when drawing, so even many
   large photos don't fill the memory. */
export function CollageMode({
  client,
  maxMB,
  maxMP,
  maxItems,
  webpOk,
  onCount
}: {
  client: WorkerClient<ImageEditorApi>;
  maxMB: number;
  maxMP: number;
  maxItems: number;
  webpOk: boolean;
  /** Tells the editor how many pictures are in the collage. */
  onCount: (count: number) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [layout, setLayout] = useState<CollageLayout>("grid2");
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);
  const [stripSize, setStripSize] = useState(800);
  const [width, setWidth] = useState(2000);
  const [height, setHeight] = useState(2000);
  const [gap, setGap] = useState(20);
  const [margin, setMargin] = useState(20);
  const [background, setBackground] = useState("#ffffff");
  const [seeThrough, setSeeThrough] = useState(false);
  const [radius, setRadius] = useState(0);
  const [fit, setFit] = useState<"contain" | "cover">("cover");
  const [captions, setCaptions] = useState<"off" | "name" | "custom">("off");
  const [save, setSave] = useState<SaveSettings>({
    format: "jpeg",
    quality: DEFAULT_QUALITY.jpeg,
    background: "#ffffff",
    name: "collage"
  });
  const [previewError, setPreviewError] = useState<string | null>(null);
  /** The Save panel makes the full-size file, so it only shows on request. */
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<number | null>(null);
  const nextId = useRef(1);
  const dragging = useRef<number | null>(null);

  // Thumbnails are freed when pictures go and when the collage closes.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(
    () => () => {
      itemsRef.current.forEach(i => URL.revokeObjectURL(i.thumbUrl));
      client.call("collageForget", {}).catch(() => undefined);
    },
    [client]
  );
  useEffect(() => onCount(items.length), [items.length, onCount]);

  /** Checks a picture and makes its thumbnail. */
  const prepare = async (file: File): Promise<Item | string> => {
    const checked = await checkFile(file, maxMB, maxMP);
    if (typeof checked === "string") return checked;
    try {
      const id = nextId.current++;
      const thumb = await client.call("collageAdd", {id, file});
      return {
        id,
        file,
        name: file.name,
        width: thumb.width,
        height: thumb.height,
        thumbUrl: URL.createObjectURL(thumb.blob),
        caption: baseName(file.name)
      };
    } catch (e) {
      return e instanceof ToolError
        ? e.message
        : `“${file.name}” couldn't be opened.`;
    }
  };

  const add = async (files: File[]) => {
    setAdding(true);
    const found: string[] = [];
    const room = maxItems - itemsRef.current.length;
    if (files.length > room) {
      found.push(
        `A collage can have up to ${maxItems} pictures on this device, so ${
          files.length - Math.max(0, room)
        } weren't added.`
      );
    }
    for (const file of files.slice(0, Math.max(0, room))) {
      const item = await prepare(file);
      if (typeof item === "string") found.push(item);
      else setItems(old => [...old, item]);
    }
    setProblems(found);
    setAdding(false);
  };

  const replace = async (id: number, file: File) => {
    const item = await prepare(file);
    if (typeof item === "string") {
      setProblems([item]);
      return;
    }
    setProblems([]);
    setItems(old =>
      old.map(x => {
        if (x.id !== id) return x;
        URL.revokeObjectURL(x.thumbUrl);
        return item;
      })
    );
    client.call("collageForget", {ids: [id]}).catch(() => undefined);
  };

  const remove = (id: number) => {
    setItems(old => {
      const gone = old.find(x => x.id === id);
      if (gone) URL.revokeObjectURL(gone.thumbUrl);
      return old.filter(x => x.id !== id);
    });
    client.call("collageForget", {ids: [id]}).catch(() => undefined);
  };

  const move = (from: number, to: number) =>
    setItems(old => {
      if (to < 0 || to >= old.length || from === to) return old;
      const next = [...old];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });

  const strip = layout === "hstrip" || layout === "vstrip";
  const captionPct = captions === "off" ? 0 : CAPTION_PCT;
  const plan = useMemo(
    () =>
      planCollage({
        layout,
        count: items.length,
        width,
        height,
        gap,
        margin,
        captionPct,
        rows,
        cols,
        stripSize,
        aspects: items.map(i => i.width / i.height)
      }),
    [
      layout,
      items,
      width,
      height,
      gap,
      margin,
      captionPct,
      rows,
      cols,
      stripSize
    ]
  );
  const settings: CollageSettings = useMemo(
    () => ({
      fit,
      background: seeThrough ? "transparent" : background,
      radius,
      captions:
        captions === "off"
          ? null
          : items.map(i => (captions === "name" ? baseName(i.name) : i.caption))
    }),
    [fit, seeThrough, background, radius, captions, items]
  );
  const ids = useMemo(() => items.map(i => i.id), [items]);
  const tooBig =
    plan.width > MAX_SIDE ||
    plan.height > MAX_SIDE ||
    (plan.width * plan.height) / 1e6 > maxMP;
  const unused = Math.max(0, items.length - plan.cells.length);

  // The preview: drawn 300 ms after the settings settle; only the latest
  // request is shown.
  const request = useRef(0);
  useEffect(() => {
    const ticket = ++request.current;
    if (items.length === 0 || tooBig) return;
    const timer = setTimeout(async () => {
      setDrawing(true);
      try {
        const scale = Math.min(
          1,
          PREVIEW_SIDE / Math.max(plan.width, plan.height)
        );
        const {bitmap} = await client.call("collage", {
          ids,
          plan,
          settings,
          scale
        });
        const canvas = canvasRef.current;
        if (ticket !== request.current || !canvas) {
          bitmap.close();
          return;
        }
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("bitmaprenderer")!.transferFromImageBitmap(bitmap);
        setPreviewError(null);
      } catch (e) {
        if (ticket === request.current && !(e instanceof CancelledError)) {
          setPreviewError(
            e instanceof ToolError
              ? e.message
              : "The preview couldn't be drawn."
          );
        }
      } finally {
        if (ticket === request.current) setDrawing(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [client, ids, plan, settings, items.length, tooBig]);

  const render: RenderFile = useCallback(
    ({format, quality, background: fill}) =>
      client.call("saveCollage", {
        ids,
        plan,
        settings,
        limit: maxMP,
        format,
        quality,
        background: fill
      }),
    [client, ids, plan, settings, maxMP]
  );

  const number = (
    id: string,
    label: string,
    value: number,
    set: (v: number) => void,
    min: number,
    max: number
  ) => (
    <div className="tool-field">
      <label className="tool-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="tool-input editor-number"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => {
          const v = Math.round(Number(e.target.value));
          if (Number.isFinite(v)) set(Math.min(max, Math.max(min, v)));
        }}
      />
    </div>
  );

  const pickers = (
    <>
      <input
        ref={addInput}
        id="collage-add-files"
        type="file"
        multiple
        hidden
        accept={ALL_EXTENSIONS.map(ext => `.${ext}`).join(",")}
        onChange={e => {
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (chosen.length) void add(chosen);
        }}
      />
      <input
        ref={replaceInput}
        id="collage-replace-file"
        type="file"
        hidden
        accept={ALL_EXTENSIONS.map(ext => `.${ext}`).join(",")}
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && replacing.current !== null)
            void replace(replacing.current, file);
        }}
      />
    </>
  );

  if (items.length === 0) {
    return (
      <div className="editor-collage-empty">
        {pickers}
        <DropZone
          inputId="collage-files"
          accept={ALL_EXTENSIONS}
          multiple
          hint={`${TYPE_NAMES} · up to ${maxItems} pictures, each up to ${maxMB} MB and ${maxMP} megapixels`}
          onFiles={files => void add(files)}
        />
        {adding && (
          <p className="tool-muted" role="status">
            Adding the pictures…
          </p>
        )}
        {problems.map(p => (
          <Notice key={p} tone="error">
            {p}
          </Notice>
        ))}
      </div>
    );
  }

  return (
    <div className="editor-collage">
      {pickers}
      <section className="editor-collage-items" aria-label="Pictures">
        <div className="editor-slider-head">
          <h2>
            Pictures ({items.length} of {maxItems})
          </h2>
        </div>
        <button
          type="button"
          className="tool-button"
          disabled={adding || items.length >= maxItems}
          onClick={() => addInput.current?.click()}
        >
          <i className="fas fa-plus" aria-hidden="true"></i> Add pictures
        </button>
        {adding && <p className="tool-muted">Adding the pictures…</p>}
        {problems.map(p => (
          <Notice key={p} tone="error">
            {p}
          </Notice>
        ))}
        <ol className="editor-collage-list">
          {items.map((item, i) => (
            <li
              key={item.id}
              className="editor-collage-card"
              draggable
              onDragStart={e => {
                dragging.current = i;
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={e => {
                if (dragging.current !== null) e.preventDefault();
              }}
              onDrop={e => {
                e.preventDefault();
                if (dragging.current !== null) move(dragging.current, i);
                dragging.current = null;
              }}
              onDragEnd={() => {
                dragging.current = null;
              }}
            >
              <img src={item.thumbUrl} alt="" />
              <div className="editor-collage-card-body">
                <span className="editor-collage-name" title={item.name}>
                  {i + 1}. {item.name}
                </span>
                {captions === "custom" && (
                  <input
                    className="tool-input"
                    aria-label={`Caption for picture ${i + 1}`}
                    maxLength={120}
                    value={item.caption}
                    onChange={e => {
                      const caption = e.target.value;
                      setItems(old =>
                        old.map(x => (x.id === item.id ? {...x, caption} : x))
                      );
                    }}
                  />
                )}
                <div className="editor-collage-card-actions">
                  <button
                    type="button"
                    aria-label={`Move picture ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <i className="fas fa-arrow-up" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    aria-label={`Move picture ${i + 1} down`}
                    disabled={i === items.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <i className="fas fa-arrow-down" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    aria-label={`Replace picture ${i + 1}`}
                    onClick={() => {
                      replacing.current = item.id;
                      replaceInput.current?.click();
                    }}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove picture ${i + 1}`}
                    onClick={() => remove(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="tool-field-hint">
          Drag the pictures to change their order, or use the arrow buttons.
        </p>
      </section>

      <section className="editor-collage-preview" aria-label="Collage preview">
        <div className="editor-collage-canvas">
          <canvas
            ref={canvasRef}
            className="editor-canvas"
            aria-label="Collage"
          />
        </div>
        <p className="tool-muted" role="status">
          {tooBig
            ? ""
            : `${formatCount(plan.width)} × ${formatCount(plan.height)} pixels${
                drawing ? " · Updating…" : ""
              }`}
        </p>
        {previewError && <Notice tone="error">{previewError}</Notice>}
      </section>

      <aside className="editor-panel" aria-labelledby="collage-settings-title">
        <h2 id="collage-settings-title">Collage</h2>
        <div className="editor-panel-body">
          <Field label="Layout">
            <select
              className="tool-select"
              aria-label="Layout"
              value={layout}
              onChange={e => setLayout(e.target.value as CollageLayout)}
            >
              {LAYOUTS.map(l => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          {layout === "custom" && (
            <div className="editor-exact-grid">
              {number("collage-rows", "Rows", rows, setRows, 1, 10)}
              {number("collage-cols", "Columns", cols, setCols, 1, 10)}
            </div>
          )}
          {strip ? (
            number(
              "collage-strip",
              layout === "hstrip" ? "Height (px)" : "Width (px)",
              stripSize,
              setStripSize,
              16,
              MAX_SIDE
            )
          ) : (
            <div className="editor-exact-grid">
              {number(
                "collage-width",
                "Width (px)",
                width,
                setWidth,
                16,
                MAX_SIDE
              )}
              {number(
                "collage-height",
                "Height (px)",
                height,
                setHeight,
                16,
                MAX_SIDE
              )}
            </div>
          )}
          {unused > 0 && (
            <Notice tone="warning">
              This layout has {plan.cells.length} places, so the last{" "}
              {unused === 1 ? "picture isn't" : `${unused} pictures aren't`}{" "}
              used.
            </Notice>
          )}
          <div className="editor-exact-grid">
            {number("collage-gap", "Gap (px)", gap, setGap, 0, 2000)}
            {number(
              "collage-margin",
              "Margin (px)",
              margin,
              setMargin,
              0,
              2000
            )}
          </div>
          {number(
            "collage-radius",
            "Rounded corners (px)",
            radius,
            setRadius,
            0,
            2000
          )}

          <FieldGroup label="Fit">
            <div className="editor-button-grid" role="group" aria-label="Fit">
              {(["cover", "contain"] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  className="tool-button"
                  aria-pressed={fit === f}
                  onClick={() => setFit(f)}
                >
                  {f === "cover" ? "Fill the space" : "Show all"}
                </button>
              ))}
            </div>
          </FieldGroup>
          <span className="tool-field-hint">
            {fit === "cover"
              ? "Fill the space: each picture fills its place, so some edges are cut off (evenly, from the middle)."
              : "Show all: each whole picture is shown, with the background around it where the shapes differ."}{" "}
            Pictures are never stretched.
          </span>

          <FieldGroup label="Background">
            <div className="editor-slider-row">
              <label className="editor-checkbox-row">
                <input
                  type="checkbox"
                  checked={seeThrough}
                  onChange={e => setSeeThrough(e.target.checked)}
                />
                <span>See-through</span>
              </label>
              {!seeThrough && (
                <ColourInput
                  label="Background colour"
                  value={background}
                  onPreview={setBackground}
                  onFinish={() => undefined}
                />
              )}
            </div>
          </FieldGroup>

          <Field label="Captions">
            <select
              className="tool-select"
              aria-label="Captions"
              value={captions}
              onChange={e => setCaptions(e.target.value as typeof captions)}
            >
              <option value="off">None</option>
              <option value="name">File names</option>
              <option value="custom">My own text</option>
            </select>
          </Field>

          {tooBig && (
            <Notice tone="error">
              {formatCount(plan.width)} × {formatCount(plan.height)} pixels is
              larger than this device can make (up to {formatCount(MAX_SIDE)}{" "}
              pixels a side and {maxMP} megapixels). Choose a smaller size.
            </Notice>
          )}
        </div>

        {!tooBig &&
          (saving ? (
            <>
              <div className="editor-slider-head">
                <h2>Save</h2>
                <button
                  type="button"
                  className="editor-reset-one"
                  onClick={() => setSaving(false)}
                >
                  Close
                </button>
              </div>
              <SavePanel
                client={client}
                settings={save}
                onSettings={setSave}
                webpOk={webpOk}
                seeThrough={seeThrough}
                render={render}
              />
            </>
          ) : (
            <button
              type="button"
              className="tool-button tool-button-primary"
              onClick={() => setSaving(true)}
            >
              <i className="fas fa-download" aria-hidden="true"></i> Save the
              collage
            </button>
          ))}
      </aside>
    </div>
  );
}
