import UPNG from "upng-js";
import {
  canSaveWebp,
  decodeImage,
  drawScaled,
  encodeCanvas,
  hasTransparency,
  makeThumbnail,
  newCanvas
} from "../../../shared/images/canvas";
import {IMAGE_TYPES, ImageType} from "../../../shared/images/header";
import {outputName} from "../../../shared/images/names";
import {zipFiles} from "../../../shared/files/zip";
import {formatBytes} from "../../../shared/limits";
import {serve} from "../../../shared/worker/serve";
import {
  Level,
  lossyQuality,
  PNG_TARGET_STEPS,
  pngColours,
  searchQuality
} from "../logic/levels";

export interface CompressSettings {
  /** A quality level, or a file size to aim for (bytes). */
  aim:
    | {kind: "level"; level: Level; custom: number}
    | {kind: "target"; bytes: number};
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

const handlers = {
  canSaveWebp: () => canSaveWebp(),

  async compress({file, type, settings, allowResize}: CompressRequest) {
    const bitmap = await decodeImage(file, file.name);
    try {
      const outType = settings.format === "same" ? type : settings.format;
      const notes: string[] = [];
      let colours: number | null = null;

      // Draws the image at a scale (1 = full size) onto a fresh canvas.
      const render = (scale: number) => {
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const {canvas, ctx} = newCanvas(w, h, settings.maxMegapixels);
        if (outType === "jpeg") {
          ctx.fillStyle = settings.background;
          ctx.fillRect(0, 0, w, h);
        }
        drawScaled(bitmap, [0, 0, bitmap.width, bitmap.height], ctx, [
          0,
          0,
          w,
          h
        ]);
        return {canvas, ctx, w, h};
      };

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
        if (
          hasTransparency(probe.ctx, probe.canvas.width, probe.canvas.height)
        ) {
          notes.push(
            "JPG can't be see-through, so transparent areas were filled with the background colour."
          );
        }
      }

      let scale = 1;
      let page = render(scale);
      let blob: Blob;
      let reached = true;
      let needs: "resize" | "webp" | null = null;

      if (settings.aim.kind === "level") {
        const {level, custom} = settings.aim;
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
        const target = settings.aim.bytes;
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
              page.canvas.width = page.canvas.height = 0;
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
        notes.push(
          `Made smaller to reach the target: now ${page.w} × ${page.h}.`
        );
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
  },

  zip: (files: {name: string; blob: Blob}[]) => zipFiles(files)
};

export type SmartImageCompressorApi = typeof handlers;

serve(handlers);
