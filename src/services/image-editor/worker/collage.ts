import {
  decodeImage,
  drawScaled,
  newCanvas
} from "../../../shared/images/canvas";
import {CollagePlan, fitInto, Rect} from "../logic/collage";
import {parseHex} from "../logic/pixels";

/** One picture of the collage: how to get it, and whether it is a copy
    kept for previews (which must not be closed after drawing). */
export interface CollagePicture {
  open: () => Promise<ImageBitmap>;
  kept: boolean;
}

/** A full-size picture, opened from its file when drawn. */
export const fromFile = (file: File): CollagePicture => ({
  open: () => decodeImage(file, file.name),
  kept: false
});

export interface CollageSettings {
  fit: "contain" | "cover";
  /** A colour, or "transparent". */
  background: string;
  /** Corner radius, in output pixels. */
  radius: number;
  /** One caption per picture (empty: none), or null for no captions. */
  captions: string[] | null;
}

function roundedPath(
  ctx: OffscreenCanvasRenderingContext2D,
  {x, y, width: w, height: h}: Rect,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  const withRound = ctx as OffscreenCanvasRenderingContext2D & {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
  };
  if (typeof withRound.roundRect === "function") {
    withRound.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

/** Shortens text with "…" until it fits. */
function fitText(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  width: number
) {
  if (ctx.measureText(text).width <= width) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + "…").width <= width) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + "…" : "";
}

/** Draws a collage. Full-size pictures are opened one at a time and closed
    straight after drawing, so at most one is in memory. */
export async function drawCollage(
  pictures: CollagePicture[],
  plan: CollagePlan,
  settings: CollageSettings,
  scale: number,
  maxMegapixels: number,
  /** Fills see-through areas (for JPG). */
  fill: string | null
) {
  const exact = scale === 1;
  const {canvas, ctx} = newCanvas(
    Math.max(1, Math.round(plan.width * scale)),
    Math.max(1, Math.round(plan.height * scale)),
    exact ? maxMegapixels : Infinity
  );
  try {
    const background =
      settings.background === "transparent" ? fill : settings.background;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const s = (r: Rect): Rect => ({
      x: r.x * scale,
      y: r.y * scale,
      width: r.width * scale,
      height: r.height * scale
    });
    // Captions are dark on light backgrounds and light on dark ones.
    const [br, bg, bb] = parseHex(background ?? "#ffffff");
    const light = 0.2126 * br + 0.7152 * bg + 0.0722 * bb > 140;

    for (let i = 0; i < Math.min(pictures.length, plan.cells.length); i++) {
      const cell = plan.cells[i]!;
      const picture = pictures[i]!;
      const bitmap = await picture.open();
      try {
        const {source, target} = fitInto(bitmap, s(cell.picture), settings.fit);
        ctx.save();
        if (settings.radius > 0) {
          roundedPath(ctx, target, settings.radius * scale);
          ctx.clip();
        }
        drawScaled(
          bitmap,
          [source.x, source.y, source.width, source.height],
          ctx,
          [target.x, target.y, target.width, target.height]
        );
        ctx.restore();
      } finally {
        if (!picture.kept) bitmap.close();
      }
      const caption = settings.captions?.[i]?.trim();
      if (caption && cell.caption) {
        const band = s(cell.caption);
        ctx.save();
        ctx.font = `${Math.max(
          1,
          Math.round(band.height * 0.55)
        )}px Arial, Helvetica, sans-serif`;
        ctx.fillStyle = light ? "#1f2937" : "#f9fafb";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          fitText(ctx, caption, band.width * 0.95),
          band.x + band.width / 2,
          band.y + band.height / 2
        );
        ctx.restore();
      }
    }
    return canvas;
  } catch (error) {
    canvas.width = canvas.height = 0;
    throw error;
  }
}
