import {
  canSaveWebp,
  decodeImage,
  encodeCanvas,
  hasTransparency,
  newCanvas
} from "../../../shared/images/canvas";
import {ImageType, InputType} from "../../../shared/images/header";
import {UserError} from "../../../shared/text/userError";
import {formatCount} from "../../../shared/text/numbers";
import {serve} from "../../../shared/worker/serve";
import {Transfer} from "../../../shared/worker/protocol";
import type {Edits} from "../logic/edits";
import {renderEdits} from "./pipeline";

/* The editor's background worker. It keeps the one open image (decoded,
   turned upright) so the page never holds full-size pictures, and draws the
   preview and the saved file from it. */

let source: ImageBitmap | null = null;
let maxMegapixels = 0;

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

  /** The full-size file, made once with the chosen settings. */
  async save({
    edits,
    format,
    quality,
    background
  }: {
    edits: Edits;
    format: ImageType;
    quality: number;
    background: string;
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
      const blob = await encodeCanvas(
        canvas,
        format,
        format === "png" ? undefined : quality
      );
      return {blob, width: canvas.width, height: canvas.height};
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
};

export type ImageEditorApi = typeof handlers;

serve(handlers);
