/* Image work inside a worker: decode (with the photo turned the right way
   up), draw at a new size with good quality, and save. */
import {UserError} from "../text/userError";
import {IMAGE_TYPES, ImageType} from "./header";
import {formatCount} from "../text/numbers";

/* Browsers refuse canvases wider or taller than this. */
export const MAX_SIDE = 16384;

export async function decodeImage(
  file: Blob,
  name: string
): Promise<ImageBitmap> {
  try {
    // "from-image" applies the photo's EXIF rotation, so phone photos come
    // out upright even though the saved file loses that information.
    // (TypeScript 4.9's type list predates the "from-image" value.)
    return await createImageBitmap(file, {
      imageOrientation: "from-image" as ImageOrientation
    });
  } catch {
    throw new UserError(
      `“${name}” couldn't be opened. It may be damaged or not really an image.`
    );
  }
}

/* A blank canvas, checked against what the browser and device can handle. */
export function newCanvas(
  width: number,
  height: number,
  maxMegapixels: number
) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w > MAX_SIDE || h > MAX_SIDE || (w * h) / 1e6 > maxMegapixels) {
    throw new UserError(
      `${formatCount(w)} × ${formatCount(
        h
      )} pixels is larger than this device can make. Choose a smaller size.`
    );
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext(
    "2d"
  ) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx)
    throw new UserError(
      "This browser can't edit images here. Try an up-to-date Chrome, Edge, Firefox or Safari."
    );
  return {canvas, ctx};
}

/* Draws part of an image into a box. Big reductions are done in halving
   steps, which keeps fine detail and text much sharper than one jump. */
export function drawScaled(
  source: ImageBitmap | OffscreenCanvas,
  [sx, sy, sw, sh]: [number, number, number, number],
  ctx: OffscreenCanvasRenderingContext2D,
  [dx, dy, dw, dh]: [number, number, number, number]
): void {
  let src: ImageBitmap | OffscreenCanvas = source;
  let box: [number, number, number, number] = [sx, sy, sw, sh];
  const steps: OffscreenCanvas[] = [];
  while (box[2] / 2 >= dw && box[3] / 2 >= dh) {
    const step = new OffscreenCanvas(
      Math.ceil(box[2] / 2),
      Math.ceil(box[3] / 2)
    );
    const stepCtx = step.getContext("2d") as OffscreenCanvasRenderingContext2D;
    stepCtx.imageSmoothingQuality = "high";
    stepCtx.drawImage(src, ...box, 0, 0, step.width, step.height);
    steps.push(step);
    src = step;
    box = [0, 0, step.width, step.height];
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, ...box, dx, dy, dw, dh);
  for (const step of steps) step.width = step.height = 0; // free the memory now
}

/* Saves a canvas. quality (0–1) applies to JPG and WebP. */
export async function encodeCanvas(
  canvas: OffscreenCanvas,
  type: ImageType,
  quality?: number
): Promise<Blob> {
  const {mime, label} = IMAGE_TYPES[type];
  let blob: Blob;
  try {
    blob = await canvas.convertToBlob({type: mime, quality});
  } catch {
    throw new UserError(
      "This device ran out of memory saving the image. Try a smaller size or fewer images at once."
    );
  }
  if (blob.type !== mime) {
    throw new UserError(
      `This browser can't save ${label} images. Choose another file type.`
    );
  }
  return blob;
}

/* A small preview (at most 192 pixels across) for result lists, so the page
   never has to decode full-size images just to show thumbnails. Kept
   see-through when the image can be. */
export async function makeThumbnail(
  source: OffscreenCanvas,
  seeThrough: boolean
): Promise<Blob> {
  const scale = Math.min(1, 192 / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const thumb = new OffscreenCanvas(w, h);
  drawScaled(
    source,
    [0, 0, source.width, source.height],
    thumb.getContext("2d") as OffscreenCanvasRenderingContext2D,
    [0, 0, w, h]
  );
  const blob = await thumb.convertToBlob(
    seeThrough ? {type: "image/png"} : {type: "image/jpeg", quality: 0.8}
  );
  thumb.width = thumb.height = 0;
  return blob;
}

let webp: Promise<boolean> | null = null;

/* Whether this browser can save WebP (Safari can show WebP but not save it). */
export function canSaveWebp(): Promise<boolean> {
  if (!webp) {
    // Chrome won't save a canvas that has never been drawn on.
    const canvas = new OffscreenCanvas(1, 1);
    (canvas.getContext("2d") as OffscreenCanvasRenderingContext2D).fillRect(
      0,
      0,
      1,
      1
    );
    webp = canvas.convertToBlob({type: "image/webp"}).then(
      blob => blob.type === "image/webp",
      () => false
    );
  }
  return webp;
}

/* Whether an image has any see-through pixels. */
export function hasTransparency(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
  return false;
}
