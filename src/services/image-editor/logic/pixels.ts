/* Pixel maths for colour adjust, effects and hidden areas. Everything works
   on RGBA bytes (as in ImageData), with no canvas, so it is the same in every
   browser and can be tested directly. Pixels that are fully see-through are
   left alone, and see-through levels are only changed by pixelate and blur
   (which have to mix them). */

export interface Adjust {
  /** −100 to 100. */
  brightness: number;
  /** −100 to 100. */
  contrast: number;
  /** −100 to 100. */
  saturation: number;
  /** Degrees, −180 to 180. */
  hue: number;
  /** −100 (cooler) to 100 (warmer). */
  warmth: number;
  /** −100 (green) to 100 (magenta). */
  tint: number;
}

export const NO_ADJUST: Adjust = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  warmth: 0,
  tint: 0
};

export interface Effects {
  /** 0 to 100. */
  grayscale: number;
  /** 0 to 100. */
  sepia: number;
  invert: boolean;
  /** Full-size pixels: 0 to 50. */
  blur: number;
  /** Block size in full-size pixels: 0 (off) or 2 to 100. */
  pixelate: number;
  /** 0 to 100. */
  sharpen: number;
}

export const NO_EFFECTS: Effects = {
  grayscale: 0,
  sepia: 0,
  invert: false,
  blur: 0,
  pixelate: 0,
  sharpen: 0
};

export const isAdjusted = (a: Adjust) =>
  a.brightness !== 0 ||
  a.contrast !== 0 ||
  a.saturation !== 0 ||
  a.hue !== 0 ||
  a.warmth !== 0 ||
  a.tint !== 0;

export const hasEffects = (e: Effects) =>
  e.grayscale > 0 ||
  e.sepia > 0 ||
  e.invert ||
  e.blur > 0 ||
  e.pixelate > 1 ||
  e.sharpen > 0;

/** Effects that change each pixel on its own (no neighbours needed). */
export const hasPointEffects = (e: Effects) =>
  e.grayscale > 0 || e.sepia > 0 || e.invert;

// Rec. 709 luma weights.
const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

/** Brightness then contrast, as a lookup table for 0–255. */
export function toneTable(brightness: number, contrast: number): Uint8Array {
  const C = contrast * 2.55;
  const f = (259 * (C + 255)) / (255 * (259 - C));
  const table = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    const bright = v + brightness * 2.55;
    const x = f * (bright - 128) + 128;
    table[v] = x <= 0 ? 0 : x >= 255 ? 255 : Math.round(x);
  }
  return table;
}

/** Saturation followed by hue rotation, as one 3×3 matrix (row-major). */
export function colourMatrix(saturation: number, hue: number): number[] {
  const k = saturation / 100;
  // v' = L + (v − L)(1 + k)  =  (1 + k)v − kL
  const s = [
    1 + k - k * LR,
    -k * LG,
    -k * LB,
    -k * LR,
    1 + k - k * LG,
    -k * LB,
    -k * LR,
    -k * LG,
    1 + k - k * LB
  ];
  // CSS Filter Effects hue-rotate matrix.
  const a = (hue * Math.PI) / 180;
  const c = Math.cos(a);
  const n = Math.sin(a);
  const h = [
    0.213 + c * 0.787 - n * 0.213,
    0.715 - c * 0.715 - n * 0.715,
    0.072 - c * 0.072 + n * 0.928,
    0.213 - c * 0.213 + n * 0.143,
    0.715 + c * 0.285 + n * 0.14,
    0.072 - c * 0.072 - n * 0.283,
    0.213 - c * 0.213 - n * 0.787,
    0.715 - c * 0.715 + n * 0.715,
    0.072 + c * 0.928 + n * 0.072
  ];
  const m: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 3; col++) {
      m.push(
        h[r * 3]! * s[col]! +
          h[r * 3 + 1]! * s[3 + col]! +
          h[r * 3 + 2]! * s[6 + col]!
      );
    }
  }
  return m;
}

/** Applies colour adjustments in place. */
export function applyAdjust(data: Uint8ClampedArray, a: Adjust) {
  if (!isAdjusted(a)) return;
  const table = toneTable(a.brightness, a.contrast);
  const colour = a.saturation !== 0 || a.hue !== 0;
  const m = colourMatrix(a.saturation, a.hue);
  const warm = a.warmth * 0.3;
  const tint = a.tint * 0.3;
  const addR = warm + tint / 2;
  const addG = -tint;
  const addB = -warm + tint / 2;
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = table[data[i]!]!;
    let g = table[data[i + 1]!]!;
    let b = table[data[i + 2]!]!;
    if (colour) {
      const r0 = r;
      const g0 = g;
      r = m0 * r0 + m1 * g0 + m2 * b;
      g = m3 * r0 + m4 * g0 + m5 * b;
      b = m6 * r0 + m7 * g0 + m8 * b;
    }
    // The clamped array rounds and clamps to 0–255.
    data[i] = r + addR;
    data[i + 1] = g + addG;
    data[i + 2] = b + addB;
  }
}

/** Grayscale, sepia and invert (in that order), in place. */
export function applyPointEffects(data: Uint8ClampedArray, e: Effects) {
  if (!hasPointEffects(e)) return;
  const gray = e.grayscale / 100;
  const sepia = e.sepia / 100;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;
    if (gray > 0) {
      const l = LR * r + LG * g + LB * b;
      r += (l - r) * gray;
      g += (l - g) * gray;
      b += (l - b) * gray;
    }
    if (sepia > 0) {
      const sr = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
      const sg = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
      const sb = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
      r += (sr - r) * sepia;
      g += (sg - g) * sepia;
      b += (sb - b) * sepia;
    }
    if (e.invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/** Replaces each n×n block (from the top-left) with its average colour. */
export function pixelate(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  n: number
) {
  const block = Math.max(1, Math.round(n));
  if (block <= 1) return;
  for (let by = 0; by < height; by += block) {
    const y1 = Math.min(height, by + block);
    for (let bx = 0; bx < width; bx += block) {
      const x1 = Math.min(width, bx + block);
      // Colours are weighted by how see-through each pixel is.
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let y = by; y < y1; y++) {
        for (let x = bx, i = (y * width + bx) * 4; x < x1; x++, i += 4) {
          const alpha = data[i + 3]!;
          r += data[i]! * alpha;
          g += data[i + 1]! * alpha;
          b += data[i + 2]! * alpha;
          a += alpha;
        }
      }
      const count = (y1 - by) * (x1 - bx);
      const or = a ? r / a : 0;
      const og = a ? g / a : 0;
      const ob = a ? b / a : 0;
      const oa = a / count;
      for (let y = by; y < y1; y++) {
        for (let x = bx, i = (y * width + bx) * 4; x < x1; x++, i += 4) {
          data[i] = or;
          data[i + 1] = og;
          data[i + 2] = ob;
          data[i + 3] = oa;
        }
      }
    }
  }
}

/** The three box sizes whose repeated blur is close to a Gaussian blur
    with this sigma ("boxes for Gauss"). Returned as radii. */
export function boxRadii(sigma: number): [number, number, number] {
  if (!(sigma > 0)) return [0, 0, 0];
  const n = 3;
  let wl = Math.floor(Math.sqrt((12 * sigma * sigma) / n + 1));
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round(
    (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4)
  );
  const sizes = [0, 1, 2].map(i => (i < m ? wl : wu));
  return sizes.map(s => Math.max(0, (s - 1) / 2)) as [number, number, number];
}

function boxPass(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  r: number,
  horizontal: boolean
) {
  const lines = horizontal ? height : width;
  const len = horizontal ? width : height;
  const step = horizontal ? 4 : width * 4;
  const span = 2 * r + 1;
  const last = len - 1;
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * width * 4 : line * 4;
    for (let c = base; c < base + 4; c++) {
      let sum = (r + 1) * src[c]!;
      for (let k = 1; k <= r; k++)
        sum += src[c + (k > last ? last : k) * step]!;
      for (let k = 0; k < len; k++) {
        dst[c + k * step] = sum / span;
        const add = k + r + 1;
        const drop = k - r;
        sum +=
          src[c + (add > last ? last : add) * step]! -
          src[c + (drop < 0 ? 0 : drop) * step]!;
      }
    }
  }
}

/** A Gaussian-like blur (three box blurs), with edges clamped. Colours are
    premultiplied by their see-through level first, so see-through edges
    don't turn dark. */
export function blur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number
) {
  const radii = boxRadii(sigma).map(r => Math.round(r));
  if (radii.every(r => r === 0) || width === 0 || height === 0) return;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  if (!opaque) {
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]! / 255;
      data[i] = data[i]! * a;
      data[i + 1] = data[i + 1]! * a;
      data[i + 2] = data[i + 2]! * a;
    }
  }
  const temp = new Uint8ClampedArray(data.length);
  for (const r of radii) {
    if (r === 0) continue;
    boxPass(data, temp, width, height, r, true);
    boxPass(temp, data, width, height, r, false);
  }
  if (!opaque) {
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]!;
      if (a === 0) {
        data[i] = data[i + 1] = data[i + 2] = 0;
      } else if (a < 255) {
        data[i] = (data[i]! * 255) / a;
        data[i + 1] = (data[i + 1]! * 255) / a;
        data[i + 2] = (data[i + 2]! * 255) / a;
      }
    }
  }
}

/** How far blur() reaches, in pixels (for copying a margin around an area). */
export const blurReach = (sigma: number) =>
  boxRadii(sigma).reduce((sum, r) => sum + Math.round(r), 0);

/** Sharpens with a 3×3 kernel: centre 1 + 4a, the four neighbours −a. */
export function sharpen(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
) {
  const a = amount / 100;
  if (a <= 0) return;
  const src = data.slice();
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const up = y > 0 ? -row : 0;
    const down = y < height - 1 ? row : 0;
    for (let x = 0; x < width; x++) {
      const i = y * row + x * 4;
      if (src[i + 3] === 0) continue;
      const left = x > 0 ? -4 : 0;
      const right = x < width - 1 ? 4 : 0;
      for (let c = 0; c < 3; c++) {
        const j = i + c;
        data[j] =
          src[j]! * (1 + 4 * a) -
          a *
            (src[j + up]! + src[j + down]! + src[j + left]! + src[j + right]!);
      }
    }
  }
}

/** "#rrggbb" (or "#rgb") as [r, g, b]; anything else is black. */
export function parseHex(colour: string): [number, number, number] {
  let hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim())?.[1] ?? "000";
  if (hex.length === 3) hex = hex.replace(/./g, ch => ch + ch);
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
