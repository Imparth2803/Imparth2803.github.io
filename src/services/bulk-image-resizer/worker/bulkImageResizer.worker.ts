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
import {serve} from "../../../shared/worker/serve";
import {FitMode, planResize, SizeChoice} from "../logic/plan";

export interface ResizeSettings {
  size: SizeChoice;
  mode: FitMode;
  /** "same" keeps each image's own type. */
  format: ImageType | "same";
  /** Fills padding and see-through areas in JPG images. */
  background: string;
  maxMegapixels: number;
}

export interface ResizeRequest {
  file: File;
  type: ImageType;
  settings: ResizeSettings;
}

const QUALITY: Partial<Record<ImageType, number>> = {jpeg: 0.92, webp: 0.9};

const handlers = {
  canSaveWebp: () => canSaveWebp(),

  async resize({file, type, settings}: ResizeRequest) {
    const bitmap = await decodeImage(file, file.name);
    try {
      const plan = planResize(
        bitmap.width,
        bitmap.height,
        settings.size,
        settings.mode
      );
      const outType = settings.format === "same" ? type : settings.format;
      const {canvas, ctx} = newCanvas(
        plan.width,
        plan.height,
        settings.maxMegapixels
      );
      const warnings: string[] = [];
      const sizeText = `${plan.width} × ${plan.height}`;
      if (outType === "jpeg") {
        // JPG can't be see-through: fill the background first.
        if (type !== "jpeg") {
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
            warnings.push(
              "JPG can't be see-through, so transparent areas were filled with the background colour."
            );
          }
        }
        ctx.fillStyle = settings.background;
        ctx.fillRect(0, 0, plan.width, plan.height);
      }
      drawScaled(bitmap, plan.from, ctx, plan.to);
      if (plan.cropped)
        warnings.push(
          `Cropped: some of the edges were cut off to fill ${sizeText}.`
        );
      if (plan.stretched)
        warnings.push(
          `Stretched: the picture is squashed or stretched to fit ${sizeText}.`
        );
      if (plan.enlarged)
        warnings.push(
          "Enlarged: this image was smaller than the new size, so it may look blurry."
        );
      const blob = await encodeCanvas(canvas, outType, QUALITY[outType]);
      const thumb = await makeThumbnail(canvas, outType !== "jpeg");
      canvas.width = canvas.height = 0;
      return {
        blob,
        thumb,
        name: outputName(file.name, IMAGE_TYPES[outType].ext),
        width: plan.width,
        height: plan.height,
        originalWidth: bitmap.width,
        originalHeight: bitmap.height,
        warnings
      };
    } finally {
      bitmap.close();
    }
  },

  zip: (files: {name: string; blob: Blob}[]) => zipFiles(files)
};

export type BulkImageResizerApi = typeof handlers;

serve(handlers);
