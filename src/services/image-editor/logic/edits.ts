/* The edits made to an image, as small settings. The original image is
   never changed: the preview and the saved file are both drawn from the
   original plus these settings, so changing a setting never wears the
   picture down. */

import {Frame, framedSize, NO_FRAME} from "./frame";
import {Adjust, Effects, NO_ADJUST, NO_EFFECTS} from "./pixels";
import {NO_WATERMARK, Watermark} from "./watermark";

export type {Frame, FramePadding} from "./frame";
export {framedSize, NO_FRAME} from "./frame";
export type {Adjust, Effects} from "./pixels";
export {NO_ADJUST, NO_EFFECTS} from "./pixels";
export type {Watermark} from "./watermark";
export {NO_WATERMARK} from "./watermark";

/** An area to hide. Position and size are shares (0–1) of the image at
    that step (after crop), so they stay put when the image is resized. */
export interface Redaction {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "solid" | "blur" | "pixelate";
  /** For solid boxes. */
  colour: string;
}

export const NO_REDACTIONS: Redaction[] = [];

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: "rect" | "circle";
}

export const NO_CROP: Crop | null = null;

export interface Transform {
  /** Quarter turns clockwise. */
  quarter: 0 | 1 | 2 | 3;
  /** Fine turn for straightening, in degrees (−45 to 45, clockwise). */
  fine: number;
  /** Mirrored left to right / top to bottom, before turning. */
  flipX: boolean;
  flipY: boolean;
}

export interface Edits {
  transform: Transform;
  crop?: Crop | null;
  adjust?: Adjust;
  effects?: Effects;
  redactions?: Redaction[];
  watermark?: Watermark | null;
  frame?: Frame;
}

export const NO_TRANSFORM: Transform = {
  quarter: 0,
  fine: 0,
  flipX: false,
  flipY: false
};

export const NO_EDITS: Edits = {
  transform: NO_TRANSFORM,
  crop: NO_CROP,
  adjust: NO_ADJUST,
  effects: NO_EFFECTS,
  redactions: NO_REDACTIONS,
  watermark: NO_WATERMARK,
  frame: NO_FRAME
};

export const MAX_FINE = 45;

const quarterOf = (n: number) => (((n % 4) + 4) % 4) as Transform["quarter"];

/** Turns the image as seen by 90° (1 = clockwise, −1 = anticlockwise). */
export function turn(t: Transform, by: 1 | -1 | 2): Transform {
  return {...t, quarter: quarterOf(t.quarter + by)};
}

/** Mirrors the image as seen on screen. Mirroring a turned picture is the
    same as mirroring it first and turning it the other way, so the stored
    turn changes sign. */
export function flip(t: Transform, axis: "x" | "y"): Transform {
  return {
    quarter: quarterOf(-t.quarter),
    fine: t.fine === 0 ? 0 : -t.fine,
    flipX: axis === "x" ? !t.flipX : t.flipX,
    flipY: axis === "y" ? !t.flipY : t.flipY
  };
}

export function straighten(t: Transform, degrees: number): Transform {
  const fine = Math.max(-MAX_FINE, Math.min(MAX_FINE, degrees));
  return {...t, fine: Number.isFinite(fine) ? Math.round(fine * 10) / 10 : 0};
}

/** Total turn in degrees, clockwise. */
export const angleOf = (t: Transform) => t.quarter * 90 + t.fine;

/** Size of the turned image. A fine turn makes the picture larger, so the
    whole image still fits (with empty corners) and nothing is cut off. */
export function transformedSize(
  width: number,
  height: number,
  t: Transform
): {width: number; height: number} {
  const sideways = t.quarter % 2 === 1;
  const w = sideways ? height : width;
  const h = sideways ? width : height;
  if (t.fine === 0) return {width: w, height: h};
  const rad = (Math.abs(t.fine) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    width: Math.ceil(w * cos + h * sin - 1e-6),
    height: Math.ceil(w * sin + h * cos - 1e-6)
  };
}

const normalizeEdits = (e: Edits): Edits => ({
  transform: e.transform,
  crop: e.crop ?? NO_CROP,
  adjust: e.adjust ?? NO_ADJUST,
  effects: e.effects ?? NO_EFFECTS,
  redactions: e.redactions ?? NO_REDACTIONS,
  watermark: e.watermark ?? NO_WATERMARK,
  frame: e.frame ?? NO_FRAME
});

export function sameEdits(a: Edits, b: Edits): boolean {
  return (
    JSON.stringify(normalizeEdits(a)) === JSON.stringify(normalizeEdits(b))
  );
}

/** Whether the result can have see-through areas that the image didn't. */
export function addsEmptyAreas(edits: Edits): boolean {
  const f = edits.frame ?? NO_FRAME;
  return (
    edits.transform.fine !== 0 ||
    edits.crop?.shape === "circle" ||
    (f.paddingColour === "transparent" &&
      (f.padding.top > 0 ||
        f.padding.right > 0 ||
        f.padding.bottom > 0 ||
        f.padding.left > 0))
  );
}

/** Total output size of an image after all edits. */
export function resultSize(
  imageWidth: number,
  imageHeight: number,
  edits: Edits
): {width: number; height: number} {
  const t = transformedSize(imageWidth, imageHeight, edits.transform);
  const w = edits.crop ? edits.crop.width : t.width;
  const h = edits.crop ? edits.crop.height : t.height;
  return framedSize(w, h, edits.frame ?? NO_FRAME);
}

export function sameTransform(a: Transform, b: Transform): boolean {
  return (
    a.quarter === b.quarter &&
    a.fine === b.fine &&
    a.flipX === b.flipX &&
    a.flipY === b.flipY
  );
}

const sameCrop = (a?: Crop | null, b?: Crop | null) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What an earlier change (turning, flipping or a new crop) would remove
    from the later steps, which are placed relative to the earlier ones. */
function removedBy(prev: Edits, next: Edits) {
  const turned = !sameTransform(prev.transform, next.transform);
  const recropped = turned || !sameCrop(prev.crop, next.crop);
  return {
    turned,
    crop: turned && !!next.crop,
    redactions: recropped && (next.redactions?.length ?? 0) > 0,
    position: recropped && next.watermark?.anchor === "custom"
  };
}

/**
 * A change to an earlier geometry step resets the later settings that depend on it,
 * inside the same history commit, so one Undo restores both.
 */
export function withEarlierChange(prev: Edits, next: Edits): Edits {
  const removed = removedBy(prev, next);
  if (!removed.crop && !removed.redactions && !removed.position) return next;
  return {
    ...next,
    ...(removed.crop ? {crop: null} : {}),
    ...(removed.redactions ? {redactions: NO_REDACTIONS} : {}),
    ...(removed.position && next.watermark
      ? {watermark: {...next.watermark, anchor: "center" as const}}
      : {})
  };
}

/** The message to show when withEarlierChange removed something. */
export function noticeForEarlierChange(
  prev: Edits,
  next: Edits
): string | null {
  const removed = removedBy(prev, next);
  const lost = [
    removed.crop && "the crop",
    removed.redactions && "the hidden areas",
    removed.position && "the watermark's position"
  ].filter((x): x is string => !!x);
  if (lost.length === 0) return null;
  const doer = !removed.turned
    ? "Changing the crop"
    : prev.transform.quarter !== next.transform.quarter ||
      prev.transform.fine !== next.transform.fine
    ? "Turning the image"
    : "Flipping the image";
  const list =
    lost.length === 1
      ? lost[0]
      : `${lost.slice(0, -1).join(", ")} and ${lost[lost.length - 1]}`;
  const them = lost.length > 1 || removed.redactions ? "them" : "it";
  return `${doer} removed ${list}. Press Undo to bring ${them} back.`;
}

/** What the workspace shows while a tool is open. */
export function previewEditsFor(tool: string, edits: Edits): Edits {
  if (tool === "crop") {
    // The whole turned image, so the crop box can be drawn over it.
    if (
      !edits.crop &&
      !edits.redactions?.length &&
      !edits.watermark &&
      edits.frame === NO_FRAME
    ) {
      return edits;
    }
    return {
      ...edits,
      crop: null,
      redactions: NO_REDACTIONS,
      watermark: NO_WATERMARK,
      frame: NO_FRAME
    };
  }
  if (tool === "redact" || tool === "watermark") {
    // No border or padding, so the boxes line up with the image.
    if (edits.frame === NO_FRAME) {
      return edits;
    }
    return {
      ...edits,
      frame: NO_FRAME
    };
  }
  return edits;
}
