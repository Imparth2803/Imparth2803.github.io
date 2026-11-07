/* Colour picker maths: writing a colour as HEX, RGB and HSL, and finding
   an image's main colours (a palette). */

export type Rgba = [number, number, number, number];

const hex2 = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();

export function toHex([r, g, b, a]: Rgba): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 255 ? hex2(a) : ""}`;
}

const alpha = (a: number) => String(Number((a / 255).toFixed(2)));

export function toRgb([r, g, b, a]: Rgba): string {
  return a < 255
    ? `rgba(${r}, ${g}, ${b}, ${alpha(a)})`
    : `rgb(${r}, ${g}, ${b})`;
}

export function toHsl([r, g, b, a]: Rgba): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    h =
      max === rn
        ? ((gn - bn) / d) % 6
        : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const hsl = `${Math.round(h) % 360}, ${Math.round(s * 100)}%, ${Math.round(
    l * 100
  )}%`;
  return a < 255 ? `hsla(${hsl}, ${alpha(a)})` : `hsl(${hsl})`;
}

/** A simple repeatable random number generator (so the palette is the
    same every time for the same image). */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** The main colours of an image (RGBA bytes, already made small): pixels
    that are mostly see-through are skipped; k-means with k-means++ starts,
    a fixed seed and 10 rounds. Most common first. */
export function palette(data: Uint8ClampedArray, k = 6): string[] {
  const points: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! >= 128) points.push(data[i]!, data[i + 1]!, data[i + 2]!);
  }
  const n = points.length / 3;
  if (n === 0) return [];
  const random = seeded(12345);
  const dist = (i: number, c: number[], j: number) => {
    const dr = points[i * 3]! - c[j * 3]!;
    const dg = points[i * 3 + 1]! - c[j * 3 + 1]!;
    const db = points[i * 3 + 2]! - c[j * 3 + 2]!;
    return dr * dr + dg * dg + db * db;
  };

  // k-means++: each new centre is picked far from the ones so far.
  const centres: number[] = [];
  const first = Math.floor(random() * n);
  centres.push(
    points[first * 3]!,
    points[first * 3 + 1]!,
    points[first * 3 + 2]!
  );
  const nearest = new Float64Array(n).fill(Infinity);
  while (centres.length / 3 < k) {
    const last = centres.length / 3 - 1;
    let total = 0;
    for (let i = 0; i < n; i++) {
      nearest[i] = Math.min(nearest[i]!, dist(i, centres, last));
      total += nearest[i]!;
    }
    if (total === 0) break; // fewer different colours than k
    let pick = random() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      pick -= nearest[i]!;
      if (pick <= 0) {
        chosen = i;
        break;
      }
    }
    centres.push(
      points[chosen * 3]!,
      points[chosen * 3 + 1]!,
      points[chosen * 3 + 2]!
    );
  }

  const count = centres.length / 3;
  const owner = new Int32Array(n);
  const sizes = new Array<number>(count).fill(0);
  for (let round = 0; round < 10; round++) {
    const sums = new Array<number>(count * 3).fill(0);
    sizes.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < count; j++) {
        const d = dist(i, centres, j);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      owner[i] = best;
      sizes[best]!++;
      sums[best * 3] += points[i * 3]!;
      sums[best * 3 + 1] += points[i * 3 + 1]!;
      sums[best * 3 + 2] += points[i * 3 + 2]!;
    }
    for (let j = 0; j < count; j++) {
      if (sizes[j]! > 0) {
        for (let c = 0; c < 3; c++)
          centres[j * 3 + c] = sums[j * 3 + c]! / sizes[j]!;
      }
    }
  }

  const found = new Map<string, number>();
  for (let j = 0; j < count; j++) {
    if (sizes[j] === 0) continue;
    const hex = toHex([
      Math.round(centres[j * 3]!),
      Math.round(centres[j * 3 + 1]!),
      Math.round(centres[j * 3 + 2]!),
      255
    ]);
    found.set(hex, (found.get(hex) ?? 0) + sizes[j]!);
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
}
