export type Level = "high" | "balanced" | "small" | "custom";

/* JPG/WebP quality (0–1) for each level. */
export function lossyQuality(level: Level, custom: number): number {
  switch (level) {
    case "high":
      return 0.85;
    case "balanced":
      return 0.7;
    case "small":
      return 0.5;
    default:
      return Math.min(1, Math.max(0.05, custom / 100));
  }
}

/* PNG colours for each level: 0 keeps every colour (lossless). A custom
   quality maps to colours: 90+ lossless, 70+ 256, 50+ 128, 30+ 64, else 32. */
export function pngColours(level: Level, custom: number): number {
  switch (level) {
    case "high":
      return 0;
    case "balanced":
      return 256;
    case "small":
      return 64;
    default:
      return custom >= 90
        ? 0
        : custom >= 70
        ? 256
        : custom >= 50
        ? 128
        : custom >= 30
        ? 64
        : 32;
  }
}

/* PNG colour counts tried, best first, when aiming for a file size. */
export const PNG_TARGET_STEPS = [0, 256, 128, 64, 32, 16];

/* Finds the highest quality whose file fits the target, by halving the
   range each time (7 tries). Returns the best fit, or the smallest result
   when nothing fits. */
export async function searchQuality(
  encode: (quality: number) => Promise<Blob>,
  target: number
): Promise<{blob: Blob; quality: number; fits: boolean}> {
  let low = 0.05;
  let high = 0.95;
  let best: {blob: Blob; quality: number} | null = null;
  const smallest = await encode(low);
  if (smallest.size > target)
    return {blob: smallest, quality: low, fits: false};
  best = {blob: smallest, quality: low};
  for (let i = 0; i < 7; i++) {
    const mid = (low + high) / 2;
    const blob = await encode(mid);
    if (blob.size <= target) {
      best = {blob, quality: mid};
      low = mid;
    } else {
      high = mid;
    }
  }
  return {...best, fits: true};
}
