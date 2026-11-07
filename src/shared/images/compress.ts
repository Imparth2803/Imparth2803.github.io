/* Makes image files smaller: the work behind the Smart Image Compressor,
   shared so the Image Editor's Save can use exactly the same levels, size
   targets and fallbacks. */
import UPNG from "upng-js";
import {
  decodeImage,
  drawScaled,
  encodeCanvas,
  hasTransparency,
  makeThumbnail,
  newCanvas
} from "./canvas";
import {IMAGE_TYPES, ImageType} from "./header";
import {outputName} from "./names";
import {formatBytes} from "../limits";
import {
  Level,
  lossyQuality,
  PNG_TARGET_STEPS,
  pngColours,
  searchQuality
} from "./compressLevels";

/** A quality level, or a file size to aim for (bytes). */
export type CompressAim =
  | {kind: "level"; level: Level; custom: number}
  | {kind: "target"; bytes: number};

export interface CompressSettings {
  aim: CompressAim;
  format: ImageType | "same";
  background: string;
  maxMegapixels: number;
}

export interface CompressRequest {
  file: File;
  type: ImageType;
  settings: CompressSettings;
  /** Allowed after the person agrees: make the image smaller to reach the target. */
  allowResize: boolean;
}

function pngBlob(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  colours: number
): Blob {
  const rgba = ctx.getImageData(0, 0, width, height).data.buffer;
  return new Blob([UPNG.encode([rgba], width, height, colours)], {
    type: "image/png"
  });
}

interface Page {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  w: number;
  h: number;
}

export interface CompressedPicture {
  blob: Blob;
  /** The canvas that was saved: the picture itself at full size, or a
      smaller copy when it had to shrink to reach the target. */
  page: Page;
  /** PNG colours used (0 = all), or null. */
  colours: number | null;
  /** 1, or less when the picture was made smaller to reach the target. */
  scale: number;
  reached: boolean;
  /** What would get closer to the target: resizing, or saving as WebP. */
  needs: "resize" | "webp" | null;
  notes: string[];
}

/** Compresses a picture as one file type. Every attempt encodes from the
    same picture (never from an earlier attempt's file), so quality is
    only lost once. A full-size canvas is used as it is, so it must already
    have its background filled when saving as JPG. */
export async function compressPicture(
  picture: ImageBitmap | OffscreenCanvas,
  outType: ImageType,
  aim: CompressAim,
  background: string,
  maxMegapixels: number,
  allowResize: boolean
): Promise<CompressedPicture> {
  const notes: string[] = [];
  let colours: number | null = null;

  // Draws the image at a scale (1 = full size) onto a fresh canvas.
  const render = (scale: number): Page => {
    if (scale === 1 && picture instanceof OffscreenCanvas) {
      const ctx = picture.getContext("2d") as OffscreenCanvasRenderingContext2D;
      return {canvas: picture, ctx, w: picture.width, h: picture.height};
    }
    const w = Math.max(1, Math.round(picture.width * scale));
    const h = Math.max(1, Math.round(picture.height * scale));
    const {canvas, ctx} = newCanvas(w, h, maxMegapixels);
    if (outType === "jpeg") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    drawScaled(picture, [0, 0, picture.width, picture.height], ctx, [
      0,
      0,
      w,
      h
    ]);
    return {canvas, ctx, w, h};
  };
  const free = (page: Page) => {
    if (page.canvas !== picture) page.canvas.width = page.canvas.height = 0;
  };

  let scale = 1;
  let page = render(scale);
  let blob: Blob;
  let reached = true;
  let needs: "resize" | "webp" | null = null;

  if (aim.kind === "level") {
    const {level, custom} = aim;
    if (outType === "png") {
      colours = pngColours(level, custom);
      blob = pngBlob(page.ctx, page.w, page.h, colours);
    } else {
      blob = await encodeCanvas(
        page.canvas,
        outType,
        lossyQuality(level, custom)
      );
    }
  } else {
    const target = aim.bytes;
    if (outType === "png") {
      blob = pngBlob(page.ctx, page.w, page.h, 0);
      colours = 0;
      for (const step of PNG_TARGET_STEPS.slice(1)) {
        if (blob.size <= target) break;
        blob = pngBlob(page.ctx, page.w, page.h, step);
        colours = step;
      }
      if (blob.size > target) {
        reached = false;
        needs = "webp";
      }
    } else {
      let found = await searchQuality(
        q => encodeCanvas(page.canvas, outType, q),
        target
      );
      if (!found.fits && allowResize) {
        // Shrink step by step (keeping the shape) until it fits.
        for (let i = 0; i < 8 && !found.fits; i++) {
          scale *= Math.max(
            0.3,
            Math.min(0.9, Math.sqrt(target / found.blob.size) * 0.95)
          );
          free(page);
          const smaller = render(scale);
          page = smaller;
          found = await searchQuality(
            q => encodeCanvas(smaller.canvas, outType, q),
            target
          );
        }
      }
      blob = found.blob;
      reached = found.fits;
      if (!reached && !allowResize) needs = "resize";
    }
    if (!reached) {
      notes.push(
        `The smallest it could get was ${formatBytes(
          blob.size
        )}, which is over your target of ${formatBytes(target)}.`
      );
    }
  }

  if (colours)
    notes.push(
      `Colours were reduced to ${colours}. Check the preview: smooth areas can look slightly banded.`
    );
  if (scale < 1)
    notes.push(`Made smaller to reach the target: now ${page.w} × ${page.h}.`);
  return {blob, page, colours, scale, reached, needs, notes};
}

/** Compresses one image file (the Smart Image Compressor). */
export async function compress({
  file,
  type,
  settings,
  allowResize
}: CompressRequest) {
  const bitmap = await decodeImage(file, file.name);
  try {
    const outType = settings.format === "same" ? type : settings.format;
    const notes: string[] = [];

    if (outType === "jpeg" && type !== "jpeg") {
      const probe = newCanvas(
        Math.min(bitmap.width, 256),
        Math.min(bitmap.height, 256),
        settings.maxMegapixels
      );
      drawScaled(bitmap, [0, 0, bitmap.width, bitmap.height], probe.ctx, [
        0,
        0,
        probe.canvas.width,
        probe.canvas.height
      ]);
      if (hasTransparency(probe.ctx, probe.canvas.width, probe.canvas.height)) {
        notes.push(
          "JPG can't be see-through, so transparent areas were filled with the background colour."
        );
      }
    }

    const result = await compressPicture(
      bitmap,
      outType,
      settings.aim,
      settings.background,
      settings.maxMegapixels,
      allowResize
    );
    const {page, scale, needs} = result;
    let {blob} = result;
    notes.push(...result.notes);
    if (outType !== type)
      notes.push(
        `Saved as ${IMAGE_TYPES[outType].label} (it was ${IMAGE_TYPES[type].label}).`
      );

    // Never hand back a bigger file of the same type.
    let keptOriginal = false;
    if (outType === type && scale === 1 && blob.size >= file.size) {
      blob = file.slice(0, file.size, file.type || IMAGE_TYPES[type].mime);
      keptOriginal = true;
      notes.length = 0;
      notes.push(
        "This image is already well compressed, so the original was kept."
      );
      if (settings.aim.kind === "target" && file.size > settings.aim.bytes) {
        notes.push(
          `It's ${formatBytes(file.size)}, over your target of ${formatBytes(
            settings.aim.bytes
          )}.`
        );
      }
    }
    const thumb = await makeThumbnail(page.canvas, outType !== "jpeg");
    page.canvas.width = page.canvas.height = 0;
    return {
      blob,
      thumb,
      name: outputName(file.name, IMAGE_TYPES[outType].ext),
      width: keptOriginal ? bitmap.width : page.w,
      height: keptOriginal ? bitmap.height : page.h,
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
      originalSize: file.size,
      notes,
      needs
    };
  } finally {
    bitmap.close();
  }
}
