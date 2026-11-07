/* The edits made to an image, as small settings. The original image is
   never changed: the preview and the saved file are both drawn from the
   original plus these settings, so changing a setting never wears the
   picture down. */

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
}

export const NO_TRANSFORM: Transform = {
  quarter: 0,
  fine: 0,
  flipX: false,
  flipY: false
};

export const NO_EDITS: Edits = {transform: NO_TRANSFORM};

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

export function sameEdits(a: Edits, b: Edits): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether the result can have see-through areas that the image didn't. */
export const addsEmptyAreas = (edits: Edits) => edits.transform.fine !== 0;
