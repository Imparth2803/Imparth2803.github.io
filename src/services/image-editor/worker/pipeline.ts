import {drawScaled, newCanvas} from "../../../shared/images/canvas";
import {angleOf, Edits, transformedSize} from "../logic/edits";

/* Draws the original image with the edits applied, at a scale (1 = full
   size for saving; smaller for the on-screen preview). The preview and the
   saved file go through exactly these steps, so they match. */
export function renderEdits(
  source: ImageBitmap,
  edits: Edits,
  scale: number,
  maxMegapixels: number,
  /** Fills the background first (for JPG, which can't be see-through). */
  background: string | null
) {
  const t = edits.transform;
  const full = transformedSize(source.width, source.height, t);
  const exact = scale === 1;
  const {canvas, ctx} = newCanvas(
    exact ? full.width : Math.max(1, Math.round(full.width * scale)),
    exact ? full.height : Math.max(1, Math.round(full.height * scale)),
    // The preview is small; only the full-size image needs the limit.
    exact ? maxMegapixels : Infinity
  );
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Shrink first (in good-quality steps) when the preview is much smaller.
  let picture: ImageBitmap | OffscreenCanvas = source;
  let shrunk: OffscreenCanvas | null = null;
  if (!exact) {
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    shrunk = new OffscreenCanvas(w, h);
    drawScaled(
      source,
      [0, 0, source.width, source.height],
      shrunk.getContext("2d") as OffscreenCanvasRenderingContext2D,
      [0, 0, w, h]
    );
    picture = shrunk;
  }

  const sw = exact ? source.width : picture.width;
  const sh = exact ? source.height : picture.height;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angleOf(t) * Math.PI) / 180);
  ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
  // Quarter turns and flips at full size move whole pixels: keep them exact.
  ctx.imageSmoothingEnabled = !(exact && t.fine === 0);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(picture, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
  if (shrunk) shrunk.width = shrunk.height = 0;
  return {canvas, ctx};
}
