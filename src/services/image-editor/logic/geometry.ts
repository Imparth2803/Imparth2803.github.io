/* Pure geometry math for the image editor: screen <-> image coordinate
   mapping, clamping, aspect ratio locking, and centre cropping. All coordinates
   are in integer pixels where applicable. */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Handle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

/** Maps a point in CSS preview pixels to full-size image pixels. */
export function toImage(
  cssPoint: [number, number],
  cssSize: Size,
  imageSize: Size
): [number, number] {
  if (cssSize.width <= 0 || cssSize.height <= 0) return [0, 0];
  return [
    (cssPoint[0] * imageSize.width) / cssSize.width,
    (cssPoint[1] * imageSize.height) / cssSize.height
  ];
}

/** Maps a point in full-size image pixels to CSS preview pixels. */
export function toScreen(
  imagePoint: [number, number],
  cssSize: Size,
  imageSize: Size
): [number, number] {
  if (imageSize.width <= 0 || imageSize.height <= 0) return [0, 0];
  return [
    (imagePoint[0] * cssSize.width) / imageSize.width,
    (imagePoint[1] * cssSize.height) / imageSize.height
  ];
}

/** Clamps a rectangle to fit entirely within bounds, with integer coordinates. */
export function clampRect(rect: Rect, bounds: Size): Rect {
  const maxW = Math.max(1, Math.round(bounds.width));
  const maxH = Math.max(1, Math.round(bounds.height));
  const w = Math.max(1, Math.min(maxW, Math.round(rect.width)));
  const h = Math.max(1, Math.min(maxH, Math.round(rect.height)));
  const x = Math.max(0, Math.min(maxW - w, Math.round(rect.x)));
  const y = Math.max(0, Math.min(maxH - h, Math.round(rect.y)));
  return {x, y, width: w, height: h};
}

/** Calculates a rectangle of aspect ratio (width / height) centered in imageSize. */
export function centreCrop(imageSize: Size, ratio: number): Rect {
  const iw = Math.max(1, Math.round(imageSize.width));
  const ih = Math.max(1, Math.round(imageSize.height));
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return {x: 0, y: 0, width: iw, height: ih};
  }

  let w: number;
  let h: number;
  if (iw / ih > ratio) {
    h = ih;
    w = Math.round(h * ratio);
  } else {
    w = iw;
    h = Math.round(w / ratio);
  }

  w = Math.max(1, Math.min(iw, w));
  h = Math.max(1, Math.min(ih, h));
  const x = Math.round((iw - w) / 2);
  const y = Math.round((ih - h) / 2);

  return clampRect({x, y, width: w, height: h}, {width: iw, height: ih});
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Resizes a box by dragging one of its handles by (dx, dy) image pixels.
 * The opposite corner (or edge) stays put, the box never leaves the image
 * and is never smaller than minSize, and with a ratio (width / height) the
 * box keeps that shape even at the image's edges. Dragging a side handle
 * with a ratio grows the box evenly about its middle on the other axis.
 */
export function resizeBox(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  bounds: Size,
  ratio: number | null = null,
  minSize = 1
): Rect {
  const r = ratio && Number.isFinite(ratio) && ratio > 0 ? ratio : null;
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  const cx = start.x + start.width / 2;
  const cy = start.y + start.height / 2;
  const west = handle.endsWith("left");
  const east = handle.endsWith("right");
  const north = handle.startsWith("top");
  const south = handle.startsWith("bottom");
  const horizontal = west || east;
  const vertical = north || south;

  // How far the box may grow from its fixed side (or about its middle).
  const roomW = west
    ? right
    : east
    ? bounds.width - start.x
    : 2 * Math.min(cx, bounds.width - cx);
  const roomH = north
    ? bottom
    : south
    ? bounds.height - start.y
    : 2 * Math.min(cy, bounds.height - cy);

  let w = start.width + (west ? -dx : east ? dx : 0);
  let h = start.height + (north ? -dy : south ? dy : 0);

  if (r) {
    // Follow the axis that moved most; the other one follows the ratio.
    const byWidth =
      !vertical ||
      (horizontal &&
        Math.abs(w - start.width) >= Math.abs(h - start.height) * r);
    if (byWidth) h = w / r;
    else w = h * r;
    const most = Math.max(1, Math.min(roomW, roomH * r));
    const least = Math.min(most, Math.max(minSize, minSize * r));
    w = Math.round(clamp(w, least, most));
    h = Math.max(1, Math.min(Math.floor(roomH), Math.round(w / r)));
  } else {
    w = Math.round(clamp(w, Math.min(minSize, roomW), roomW));
    h = Math.round(clamp(h, Math.min(minSize, roomH), roomH));
    if (!horizontal) w = start.width;
    if (!vertical) h = start.height;
  }

  const x = west ? right - w : east ? start.x : Math.round(cx - w / 2);
  const y = north ? bottom - h : south ? start.y : Math.round(cy - h / 2);
  return clampRect({x, y, width: w, height: h}, bounds);
}
