import {drawScaled, newCanvas} from "../../../shared/images/canvas";
import {UserError} from "../../../shared/text/userError";
import {
  Adjust,
  angleOf,
  Crop,
  Edits,
  Effects,
  Frame,
  Redaction,
  Transform,
  transformedSize,
  Watermark
} from "../logic/edits";
import {isFramed} from "../logic/frame";
import {
  applyAdjust,
  applyPointEffects,
  blur,
  blurReach,
  hasPointEffects,
  isAdjusted,
  parseHex,
  pixelate,
  sharpen
} from "../logic/pixels";
import {
  fontFor,
  fontPx,
  itemSize,
  lineOf,
  placeCentre,
  tileCentres
} from "../logic/watermark";

/* Draws the original image with the edits applied, at a scale (1 = full
   size for saving; smaller for the on-screen preview). The preview and the
   saved file go through exactly these steps, so they match.

   Fixed pipeline order:
   upright (decode) -> rotate/flip -> crop -> resize -> colour adjust
   -> effects -> redaction -> watermark -> border & padding -> encode
*/

function stepTransform(
  source: ImageBitmap,
  t: Transform,
  scale: number,
  maxMegapixels: number
): OffscreenCanvas {
  const full = transformedSize(source.width, source.height, t);
  const exact = scale === 1;
  const {canvas, ctx} = newCanvas(
    exact ? full.width : Math.max(1, Math.round(full.width * scale)),
    exact ? full.height : Math.max(1, Math.round(full.height * scale)),
    exact ? maxMegapixels : Infinity
  );

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
  return canvas;
}

function stepCrop(
  input: OffscreenCanvas,
  crop: Crop | null | undefined,
  fullWidth: number,
  fullHeight: number,
  scale: number,
  maxMegapixels: number
): OffscreenCanvas {
  if (!crop) return input;

  const x = Math.max(0, Math.round(crop.x));
  const y = Math.max(0, Math.round(crop.y));
  const w = Math.max(1, Math.round(crop.width));
  const h = Math.max(1, Math.round(crop.height));

  const exact = scale === 1;
  const targetW = exact ? w : Math.max(1, Math.round(w * scale));
  const targetH = exact ? h : Math.max(1, Math.round(h * scale));

  const {canvas, ctx} = newCanvas(
    targetW,
    targetH,
    exact ? maxMegapixels : Infinity
  );

  const sx = exact ? x : (x / fullWidth) * input.width;
  const sy = exact ? y : (y / fullHeight) * input.height;
  const sw = exact ? w : (w / fullWidth) * input.width;
  const sh = exact ? h : (h / fullHeight) * input.height;

  ctx.imageSmoothingEnabled = !exact;
  if (!exact) ctx.imageSmoothingQuality = "high";

  ctx.drawImage(input, sx, sy, sw, sh, 0, 0, targetW, targetH);

  if (crop.shape === "circle") {
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(
      targetW / 2,
      targetH / 2,
      Math.min(targetW, targetH) / 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  input.width = input.height = 0;
  return canvas;
}

function stepFrame(
  input: OffscreenCanvas,
  frame: Frame | undefined,
  scale: number,
  maxMegapixels: number
): OffscreenCanvas {
  if (!frame || !isFramed(frame)) return input;

  const exact = scale === 1;
  const b = exact
    ? Math.max(0, Math.round(frame.border))
    : frame.border > 0
    ? Math.max(1, Math.round(frame.border * scale))
    : 0;
  const p = frame.padding;
  const top = exact
    ? Math.max(0, Math.round(p.top))
    : p.top > 0
    ? Math.max(1, Math.round(p.top * scale))
    : 0;
  const right = exact
    ? Math.max(0, Math.round(p.right))
    : p.right > 0
    ? Math.max(1, Math.round(p.right * scale))
    : 0;
  const bottom = exact
    ? Math.max(0, Math.round(p.bottom))
    : p.bottom > 0
    ? Math.max(1, Math.round(p.bottom * scale))
    : 0;
  const left = exact
    ? Math.max(0, Math.round(p.left))
    : p.left > 0
    ? Math.max(1, Math.round(p.left * scale))
    : 0;

  const targetW = input.width + 2 * b + left + right;
  const targetH = input.height + 2 * b + top + bottom;

  const {canvas, ctx} = newCanvas(
    targetW,
    targetH,
    exact ? maxMegapixels : Infinity
  );

  // 1. Padding
  if (frame.paddingColour !== "transparent") {
    ctx.fillStyle = frame.paddingColour;
    ctx.fillRect(0, 0, targetW, targetH);
  }

  // 2. Border
  if (b > 0) {
    ctx.fillStyle = frame.borderColour;
    ctx.fillRect(left, top, input.width + 2 * b, input.height + 2 * b);
  }

  // 3. Image
  ctx.drawImage(input, left + b, top + b);

  input.width = input.height = 0;
  return canvas;
}

const ctxOf = (canvas: OffscreenCanvas) =>
  canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

/* Runs pixel maths over the image a band of rows at a time, so a large
   image never needs a second full-size copy of its pixels. Each band is
   read with `margin` extra rows above and below (for maths that looks at
   neighbours) and only its own rows are written back, so the result is the
   same as doing the whole image at once. */
function inBands(
  canvas: OffscreenCanvas,
  rows: number,
  margin: number,
  work: (data: Uint8ClampedArray, width: number, height: number) => void
) {
  const ctx = ctxOf(canvas);
  const {width, height} = canvas;
  for (let y = 0; y < height; y += rows) {
    const top = Math.max(0, y - margin);
    const bottom = Math.min(height, y + rows + margin);
    const image = ctx.getImageData(0, top, width, bottom - top);
    work(image.data, width, bottom - top);
    ctx.putImageData(
      image,
      0,
      top,
      0,
      y - top,
      width,
      Math.min(rows, height - y)
    );
  }
}

const BAND_ROWS = 512;

function stepAdjust(input: OffscreenCanvas, adjust: Adjust | undefined) {
  if (adjust && isAdjusted(adjust)) {
    inBands(input, BAND_ROWS, 0, data => applyAdjust(data, adjust));
  }
  return input;
}

/** A length in full-size pixels, at this scale (at least 1 when set). */
const scaled = (px: number, scale: number) =>
  px > 0 ? Math.max(1, Math.round(px * scale)) : 0;

function stepEffects(
  input: OffscreenCanvas,
  effects: Effects | undefined,
  scale: number
) {
  if (!effects) return input;
  if (hasPointEffects(effects)) {
    inBands(input, BAND_ROWS, 0, data => applyPointEffects(data, effects));
  }
  const block = effects.pixelate > 1 ? scaled(effects.pixelate, scale) : 0;
  if (block > 1) {
    // Bands are whole blocks tall, so blocks line up with the top-left.
    const rows = Math.max(1, Math.floor(BAND_ROWS / block)) * block;
    inBands(input, rows, 0, (data, w, h) => pixelate(data, w, h, block));
  }
  if (effects.blur > 0) {
    const sigma = (effects.blur * scale) / 2;
    inBands(input, BAND_ROWS, blurReach(sigma), (data, w, h) =>
      blur(data, w, h, sigma)
    );
  }
  if (effects.sharpen > 0) {
    inBands(input, BAND_ROWS, 1, (data, w, h) =>
      sharpen(data, w, h, effects.sharpen)
    );
  }
  return input;
}

/** A hidden area in pixels, rounded outwards so it is fully covered. */
export function redactionRect(r: Redaction, width: number, height: number) {
  const fuzz = 1e-6;
  const x0 = Math.max(0, Math.floor(r.x * width + fuzz));
  const y0 = Math.max(0, Math.floor(r.y * height + fuzz));
  const x1 = Math.min(width, Math.ceil((r.x + r.w) * width - fuzz));
  const y1 = Math.min(height, Math.ceil((r.y + r.h) * height - fuzz));
  return {x: x0, y: y0, width: x1 - x0, height: y1 - y0};
}

function stepRedact(
  input: OffscreenCanvas,
  redactions: Redaction[] | undefined,
  scale: number
) {
  if (!redactions?.length) return input;
  const ctx = ctxOf(input);
  for (const r of redactions) {
    const box = redactionRect(r, input.width, input.height);
    if (box.width <= 0 || box.height <= 0) continue;
    // The area's shorter side at full size sets how strong the hiding is.
    const side = Math.min(box.width, box.height) / scale;
    if (r.kind === "solid") {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      // Always fully opaque, whatever the colour setting says.
      ctx.fillStyle = `rgb(${parseHex(r.colour).join(",")})`;
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.restore();
    } else if (r.kind === "pixelate") {
      const block = scaled(Math.max(8, Math.round(side / 12)), scale);
      const image = ctx.getImageData(box.x, box.y, box.width, box.height);
      pixelate(image.data, box.width, box.height, block);
      ctx.putImageData(image, box.x, box.y);
    } else {
      const sigma = Math.max(8, side / 6) * scale;
      // Copied with a margin, so the edges of the area are blurred too.
      const m = blurReach(sigma);
      const x0 = Math.max(0, box.x - m);
      const y0 = Math.max(0, box.y - m);
      const x1 = Math.min(input.width, box.x + box.width + m);
      const y1 = Math.min(input.height, box.y + box.height + m);
      const image = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
      blur(image.data, x1 - x0, y1 - y0, sigma);
      ctx.putImageData(
        image,
        x0,
        y0,
        box.x - x0,
        box.y - y0,
        box.width,
        box.height
      );
    }
  }
  return input;
}

function stepWatermark(
  input: OffscreenCanvas,
  w: Watermark | null | undefined,
  logos: ReadonlyMap<string, ImageBitmap>
) {
  if (!w || w.opacity <= 0) return input;
  const image = {width: input.width, height: input.height};
  const ctx = ctxOf(input);
  let draw: (x: number, y: number) => void;
  let item: {width: number; height: number};

  if (w.kind === "logo") {
    if (!w.logoId) return input;
    const logo = logos.get(w.logoId);
    if (!logo) {
      throw new UserError(
        "The watermark's logo isn't open any more. Pick the logo again in Watermark."
      );
    }
    item = itemSize(w, image, {logo});
    const {width, height} = item;
    draw = (x, y) =>
      ctx.drawImage(logo, x - width / 2, y - height / 2, width, height);
  } else {
    const text = lineOf(w.text);
    if (!text) return input;
    ctx.font = fontFor(w, fontPx(w, image));
    item = itemSize(w, image, {textWidth: ctx.measureText(text).width});
    draw = (x, y) => ctx.fillText(text, x, y);
  }

  ctx.save();
  ctx.globalAlpha = w.opacity / 100;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = w.colour;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const angle = (w.rotation * Math.PI) / 180;
  if (w.tiled) {
    ctx.translate(image.width / 2, image.height / 2);
    ctx.rotate(angle);
    for (const at of tileCentres(w, image, item)) draw(at.x, at.y);
  } else {
    const at = placeCentre(w, image, item);
    ctx.translate(at.x, at.y);
    ctx.rotate(angle);
    draw(0, 0);
  }
  ctx.restore();
  return input;
}

export function renderEdits(
  source: ImageBitmap,
  edits: Edits,
  scale: number,
  maxMegapixels: number,
  /** Fills the background first (for JPG, which can't be see-through). */
  background: string | null,
  /** Logos for logo watermarks, by id. */
  logos: ReadonlyMap<string, ImageBitmap> = new Map()
): {canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D} {
  const transformed = transformedSize(
    source.width,
    source.height,
    edits.transform
  );

  // 1. Rotate & flip
  let current = stepTransform(source, edits.transform, scale, maxMegapixels);

  // 2. Crop
  current = stepCrop(
    current,
    edits.crop,
    transformed.width,
    transformed.height,
    scale,
    maxMegapixels
  );

  // (Resize comes here in Stage 6.)

  // Colour adjust, effects, hidden areas and watermark draw on the same
  // canvas, so they need no extra copies.
  current = stepAdjust(current, edits.adjust);
  current = stepEffects(current, edits.effects, scale);
  current = stepRedact(current, edits.redactions, scale);
  try {
    current = stepWatermark(current, edits.watermark, logos);
  } catch (error) {
    current.width = current.height = 0;
    throw error;
  }

  // 3. Border & padding
  current = stepFrame(current, edits.frame, scale, maxMegapixels);

  // 4. Background fill for lossy formats that cannot have transparent areas (e.g. JPG)
  if (background) {
    const exact = scale === 1;
    const {canvas: bgCanvas, ctx: bgCtx} = newCanvas(
      current.width,
      current.height,
      exact ? maxMegapixels : Infinity
    );
    bgCtx.fillStyle = background;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgCtx.drawImage(current, 0, 0);
    current.width = current.height = 0;
    current = bgCanvas;
  }

  return {
    canvas: current,
    ctx: current.getContext("2d") as OffscreenCanvasRenderingContext2D
  };
}
