import {
  canSaveWebp,
  decodeImage,
  drawScaled,
  encodeCanvas,
  hasTransparency,
  newCanvas
} from "../../../shared/images/canvas";
import {CompressAim, compressPicture} from "../../../shared/images/compress";
import {ImageType, InputType} from "../../../shared/images/header";
import {UserError} from "../../../shared/text/userError";
import {formatCount} from "../../../shared/text/numbers";
import {serve} from "../../../shared/worker/serve";
import {Transfer} from "../../../shared/worker/protocol";
import type {CollagePlan} from "../logic/collage";
import {palette, Rgba} from "../logic/colour";
import type {Edits} from "../logic/edits";
import {readMetadata} from "../logic/exif";
import {
  cameraDetailsFor,
  insertIntoJpeg,
  removeAll,
  removeLocation
} from "../logic/stripMetadata";
import {
  CollagePicture,
  CollageSettings,
  drawCollage,
  fromFile
} from "./collage";
import {renderEdits} from "./pipeline";

/* The editor's background worker. It keeps the one open image (decoded,
   turned upright) so the page never holds full-size pictures, and draws the
   preview and the saved file from it. */

let source: ImageBitmap | null = null;
/** The opened file itself, for reading and removing photo details. */
let sourceFile: File | null = null;
let maxMegapixels = 0;
/** The collage's pictures, by id: the file (opened at full size only when
    saving, one at a time) and a small copy for quick previews. */
const collage = new Map<number, {file: File; small: ImageBitmap}>();
/** Longest side of the small copies (enough for the preview's cells). */
const COLLAGE_PREVIEW_SIDE = 1024;

function collageEntries(ids: number[]) {
  return ids.map(id => {
    const entry = collage.get(id);
    if (!entry) {
      throw new UserError(
        "A picture in the collage isn't open any more. Add it again."
      );
    }
    return entry;
  });
}

function forgetCollage(ids: number[]) {
  for (const id of ids) {
    collage.get(id)?.small.close();
    collage.delete(id);
  }
}

/** The edited image at full size, kept while the colour picker is open. */
let picker: OffscreenCanvas | null = null;

function closePicker() {
  if (picker) picker.width = picker.height = 0;
  picker = null;
}

async function sourceBytes() {
  if (!sourceFile) throw new UserError("Open an image first.");
  return new Uint8Array(await sourceFile.arrayBuffer());
}

/** Checks a file made by removing details: the details must be gone and
    the picture must still open. */
async function verified(bytes: Uint8Array, type: string, all: boolean) {
  const meta = readMetadata(bytes);
  const clean = all
    ? meta.gps === null &&
      !meta.hasXmp &&
      meta.fields.every(f => f.label === "Orientation")
    : meta.gps === null && !meta.hasXmp;
  if (!clean)
    throw new UserError(
      "The details couldn't be removed safely, so no file was made."
    );
  const blob = new Blob([bytes], {type});
  try {
    (await createImageBitmap(blob)).close();
  } catch {
    throw new UserError(
      "The cleaned file didn't open correctly, so it isn't offered."
    );
  }
  return blob;
}

/** Logos for logo watermarks, oldest first. Edits hold only their ids. */
const logos = new Map<string, ImageBitmap>();
let logoCount = 0;
const MAX_LOGOS = 5;
const MAX_LOGO_MB = 10;
const MAX_LOGO_MEGAPIXELS = 16;

function closeLogos() {
  logos.forEach(logo => logo.close());
  logos.clear();
}

function opened(): ImageBitmap {
  if (!source) throw new UserError("Open an image first.");
  return source;
}

const handlers = {
  canSaveWebp: () => canSaveWebp(),

  async open({
    file,
    type,
    limit
  }: {
    file: File;
    type: InputType;
    limit: number;
  }) {
    source?.close();
    source = null;
    sourceFile = null;
    closePicker();
    closeLogos();
    let bitmap: ImageBitmap;
    try {
      bitmap = await decodeImage(file, file.name);
    } catch (error) {
      if (type === "avif") {
        throw new UserError(
          `This browser can't open AVIF images like “${file.name}”. Try an up-to-date Chrome, Edge, Firefox or Safari, or save it as a JPG or PNG first.`
        );
      }
      throw error;
    }
    const megapixels = (bitmap.width * bitmap.height) / 1e6;
    if (megapixels > limit) {
      bitmap.close();
      throw new UserError(
        `“${file.name}” is ${formatCount(bitmap.width)} × ${formatCount(
          bitmap.height
        )} pixels (${megapixels.toFixed(
          0
        )} megapixels); this device can edit images up to ${limit} megapixels. Make it smaller with the Bulk Image Resizer first.`
      );
    }
    source = bitmap;
    sourceFile = file;
    maxMegapixels = limit;
    // See-through pixels? (Checked on a small copy, to save memory.)
    const probe = newCanvas(
      Math.min(bitmap.width, 256),
      Math.min(bitmap.height, 256),
      Infinity
    );
    probe.ctx.drawImage(bitmap, 0, 0, probe.canvas.width, probe.canvas.height);
    const seeThrough = hasTransparency(
      probe.ctx,
      probe.canvas.width,
      probe.canvas.height
    );
    probe.canvas.width = probe.canvas.height = 0;
    return {width: bitmap.width, height: bitmap.height, seeThrough};
  },

  /** Opens a picture for a logo watermark (see-through areas are kept). */
  async openLogo({file}: {file: File}) {
    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      throw new UserError(
        `“${file.name}” is too big for a logo. Use a picture up to ${MAX_LOGO_MB} MB.`
      );
    }
    const bitmap = await decodeImage(file, file.name);
    if ((bitmap.width * bitmap.height) / 1e6 > MAX_LOGO_MEGAPIXELS) {
      bitmap.close();
      throw new UserError(
        `“${file.name}” has too many pixels for a logo. Use a picture up to ${MAX_LOGO_MEGAPIXELS} megapixels.`
      );
    }
    const evicted: string[] = [];
    while (logos.size >= MAX_LOGOS) {
      const [oldest, logo] = logos.entries().next().value as [
        string,
        ImageBitmap
      ];
      logo.close();
      logos.delete(oldest);
      evicted.push(oldest);
    }
    const logoId = `logo-${++logoCount}`;
    logos.set(logoId, bitmap);
    return {logoId, width: bitmap.width, height: bitmap.height, evicted};
  },

  /** The preview, at a smaller scale. Handed over, not copied. */
  render({edits, scale}: {edits: Edits; scale: number}) {
    const {canvas} = renderEdits(
      opened(),
      edits,
      scale,
      maxMegapixels,
      null,
      logos
    );
    const bitmap = canvas.transferToImageBitmap();
    canvas.width = canvas.height = 0;
    return new Transfer({bitmap}, [bitmap]);
  },

  /** Draws the edited image at full size once, for the colour picker. */
  pickerStart({edits}: {edits: Edits}) {
    closePicker();
    picker = renderEdits(opened(), edits, 1, maxMegapixels, null, logos).canvas;
    return {width: picker.width, height: picker.height};
  },

  pickerEnd() {
    closePicker();
  },

  /** The colour of one pixel, and the 11 × 11 pixels around it. */
  sample({x, y}: {x: number; y: number}) {
    if (!picker) throw new UserError("Open the colour picker first.");
    const px = Math.min(picker.width - 1, Math.max(0, Math.floor(x)));
    const py = Math.min(picker.height - 1, Math.max(0, Math.floor(y)));
    const ctx = picker.getContext("2d") as OffscreenCanvasRenderingContext2D;
    const patch = ctx.getImageData(px - 5, py - 5, 11, 11).data;
    const i = (5 * 11 + 5) * 4;
    const rgba: Rgba = [patch[i]!, patch[i + 1]!, patch[i + 2]!, patch[i + 3]!];
    return {x: px, y: py, rgba, patch};
  },

  /** The image's main colours. */
  palette() {
    if (!picker) throw new UserError("Open the colour picker first.");
    const scale = Math.min(1, 100 / Math.max(picker.width, picker.height));
    const small = newCanvas(
      Math.max(1, Math.round(picker.width * scale)),
      Math.max(1, Math.round(picker.height * scale)),
      Infinity
    );
    try {
      drawScaled(picker, [0, 0, picker.width, picker.height], small.ctx, [
        0,
        0,
        small.canvas.width,
        small.canvas.height
      ]);
      const data = small.ctx.getImageData(
        0,
        0,
        small.canvas.width,
        small.canvas.height
      ).data;
      return palette(data, 6);
    } finally {
      small.canvas.width = small.canvas.height = 0;
    }
  },

  /** The photo details in the opened file. */
  async metadata() {
    return readMetadata(await sourceBytes());
  },

  /** The opened file without its location, or without all its details.
      The picture itself isn't re-saved, so its quality is the same. */
  async stripMetadata({mode}: {mode: "location" | "all"}) {
    const bytes = await sourceBytes();
    const result = mode === "all" ? removeAll(bytes) : removeLocation(bytes);
    if (!result.ok) throw new UserError(result.problem);
    const blob = await verified(result.bytes, sourceFile!.type, mode === "all");
    return {blob, keptOrientation: result.keptOrientation};
  },

  /** Keeps a picture for the collage: a small copy for previews and a
      thumbnail for the list. The full-size picture isn't kept. */
  async collageAdd({id, file}: {id: number; file: File}) {
    const bitmap = await decodeImage(file, file.name);
    const shrink = (side: number) => {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const c = newCanvas(
        Math.max(1, Math.round(bitmap.width * scale)),
        Math.max(1, Math.round(bitmap.height * scale)),
        Infinity
      );
      drawScaled(bitmap, [0, 0, bitmap.width, bitmap.height], c.ctx, [
        0,
        0,
        c.canvas.width,
        c.canvas.height
      ]);
      return c.canvas;
    };
    try {
      const small = shrink(COLLAGE_PREVIEW_SIDE);
      const thumb = shrink(192);
      const blob = await thumb.convertToBlob({type: "image/png"});
      thumb.width = thumb.height = 0;
      forgetCollage([id]);
      collage.set(id, {file, small: small.transferToImageBitmap()});
      small.width = small.height = 0;
      return {blob, width: bitmap.width, height: bitmap.height};
    } finally {
      bitmap.close();
    }
  },

  /** Lets go of collage pictures (all of them when no ids are given). */
  collageForget({ids}: {ids?: number[]}) {
    forgetCollage(ids ?? Array.from(collage.keys()));
  },

  /** The collage preview, at a smaller scale. */
  async collage({
    ids,
    plan,
    settings,
    scale
  }: {
    ids: number[];
    plan: CollagePlan;
    settings: CollageSettings;
    scale: number;
  }) {
    // Previews are drawn from the small copies, so no full-size picture
    // is opened.
    const pictures: CollagePicture[] = collageEntries(ids).map(e => ({
      open: () => Promise.resolve(e.small),
      kept: true
    }));
    const canvas = await drawCollage(
      pictures,
      plan,
      settings,
      scale,
      Infinity,
      null
    );
    const bitmap = canvas.transferToImageBitmap();
    canvas.width = canvas.height = 0;
    return new Transfer({bitmap}, [bitmap]);
  },

  /** The full-size collage file. */
  async saveCollage({
    ids,
    plan,
    settings,
    limit,
    format,
    quality,
    background
  }: {
    ids: number[];
    plan: CollagePlan;
    settings: CollageSettings;
    limit: number;
    format: ImageType;
    quality: number;
    background: string;
  }) {
    const canvas = await drawCollage(
      collageEntries(ids).map(e => fromFile(e.file)),
      plan,
      settings,
      1,
      limit,
      format === "jpeg" ? background : null
    );
    try {
      const blob = await encodeCanvas(
        canvas,
        format,
        format === "png" ? undefined : quality
      );
      return {blob, width: canvas.width, height: canvas.height};
    } finally {
      canvas.width = canvas.height = 0;
    }
  },

  /** The full-size file, made once with the chosen settings. */
  async save({
    edits,
    format,
    quality,
    background,
    keepCamera = false,
    compress
  }: {
    edits: Edits;
    format: ImageType;
    quality: number;
    background: string;
    /** JPG only: copy the original's camera details (never the location). */
    keepCamera?: boolean;
    /** Make the file smaller, as the Smart Image Compressor does. */
    compress?: {aim: CompressAim; allowResize: boolean};
  }) {
    const {canvas} = renderEdits(
      opened(),
      edits,
      1,
      maxMegapixels,
      format === "jpeg" ? background : null,
      logos
    );
    try {
      // The camera details are worked out first, so a size target can
      // leave room for them.
      const details =
        keepCamera && format === "jpeg"
          ? cameraDetailsFor(await sourceBytes(), canvas.width, canvas.height)
          : null;
      const camera: "kept" | "none" | "damaged" | "too-big" | null = details
        ? details.ok
          ? "kept"
          : details.reason
        : null;

      let blob: Blob;
      let width = canvas.width;
      let height = canvas.height;
      let notes: string[] = [];
      let reached = true;
      let needs: "resize" | "webp" | null = null;
      let aimed: number | null = null;
      if (compress) {
        // Every try is encoded from this one full-size picture, never from
        // an earlier try, so quality is only lost once.
        const room = details?.ok ? details.segment.length : 0;
        const aim: CompressAim =
          compress.aim.kind === "target"
            ? {kind: "target", bytes: Math.max(1, compress.aim.bytes - room)}
            : compress.aim;
        aimed = compress.aim.kind === "target" ? compress.aim.bytes : null;
        const result = await compressPicture(
          canvas,
          format,
          aim,
          background,
          maxMegapixels,
          compress.allowResize
        );
        blob = result.blob;
        width = result.page.w;
        height = result.page.h;
        if (result.page.canvas !== canvas) {
          result.page.canvas.width = result.page.canvas.height = 0;
        }
        notes = result.notes;
        reached = result.reached;
        needs = result.needs;
      } else {
        blob = await encodeCanvas(
          canvas,
          format,
          format === "png" ? undefined : quality
        );
      }
      if (details?.ok) {
        // The size recorded must match the file (it may have shrunk).
        const sized =
          width === canvas.width
            ? details
            : cameraDetailsFor(await sourceBytes(), width, height);
        if (sized.ok) {
          const bytes = insertIntoJpeg(
            new Uint8Array(await blob.arrayBuffer()),
            sized.segment
          );
          if (readMetadata(bytes).gps !== null) {
            throw new UserError(
              "The camera details couldn't be copied safely."
            );
          }
          blob = new Blob([bytes], {type: "image/jpeg"});
        }
      }
      if (aimed !== null && blob.size > aimed) reached = false;
      return {blob, width, height, camera, notes, reached, needs, aimed};
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
};

export type ImageEditorApi = typeof handlers;

serve(handlers);
