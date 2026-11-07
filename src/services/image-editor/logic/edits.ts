/* The edits made to an image, as small settings. The original image is
   never changed: the preview and the saved file are both drawn from the
   original plus these settings, so changing a setting never wears the
   picture down. */

import {
  FitMode,
  planResize,
  SizeChoice
} from "../../../shared/images/resizePlan";
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

/** A new size for the image (after crop), as on the Bulk Image Resizer. */
export interface Resize {
  choice: SizeChoice;
  fit: FitMode;
}

export const NO_RESIZE: Resize | null = null;

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
  resize?: Resize | null;
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
  resize: NO_RESIZE,
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
  resize: e.resize ?? NO_RESIZE,
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

/** Whether the result can have see-through areas that the image didn't.
    With the image's size, a resize that leaves empty space counts too. */
export function addsEmptyAreas(
  edits: Edits,
  imageSize?: {width: number; height: number}
): boolean {
  const f = edits.frame ?? NO_FRAME;
  const resized =
    imageSize && edits.resize
      ? resizePlanFor(imageSize.width, imageSize.height, edits)
      : null;
  return (
    !!resized?.padded ||
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
  const plan = resizePlanFor(imageWidth, imageHeight, edits);
  if (plan) return framedSize(plan.width, plan.height, edits.frame ?? NO_FRAME);
  const c = croppedSize(imageWidth, imageHeight, edits);
  return framedSize(c.width, c.height, edits.frame ?? NO_FRAME);
}

/** The image's size after rotate & flip and crop (before resizing). */
export function croppedSize(
  imageWidth: number,
  imageHeight: number,
  edits: Edits
): {width: number; height: number} {
  if (edits.crop) return {width: edits.crop.width, height: edits.crop.height};
  return transformedSize(imageWidth, imageHeight, edits.transform);
}

/** How the resize fits the cropped image, or null when there is none. */
export function resizePlanFor(
  imageWidth: number,
  imageHeight: number,
  edits: Edits
) {
  if (!edits.resize) return null;
  const c = croppedSize(imageWidth, imageHeight, edits);
  try {
    return planResize(c.width, c.height, edits.resize.choice, edits.resize.fit);
  } catch {
    return null; // no size given yet
  }
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

/** Whether a resize can move the picture inside the image (Contain adds
    space, Cover cuts edges), which shifts what later steps placed on it. */
const movesPicture = (r?: Resize | null) =>
  !!r &&
  r.fit !== "stretch" &&
  r.choice.kind === "box" &&
  r.choice.width !== null &&
  r.choice.height !== null;

/** What an earlier change (turning, flipping, a new crop, or a resize that
    moves the picture) would remove from the later steps, which are placed
    relative to the earlier ones. */
function removedBy(prev: Edits, next: Edits) {
  const turned = !sameTransform(prev.transform, next.transform);
  const resized =
    JSON.stringify(prev.resize ?? null) !==
      JSON.stringify(next.resize ?? null) &&
    (movesPicture(prev.resize) || movesPicture(next.resize));
  const recropped = turned || resized || !sameCrop(prev.crop, next.crop);
  return {
    turned,
    recroppedOnly: !turned && !resized,
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
  const doer = removed.recroppedOnly
    ? "Changing the crop"
    : !removed.turned
    ? "Changing the size"
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
      !edits.resize &&
      !edits.redactions?.length &&
      !edits.watermark &&
      edits.frame === NO_FRAME
    ) {
      return edits;
    }
    return {
      ...edits,
      crop: null,
      resize: NO_RESIZE,
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
