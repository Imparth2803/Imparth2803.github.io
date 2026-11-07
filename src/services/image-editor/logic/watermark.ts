/* Watermark settings and where the watermark goes. Sizes are a share of
   the image (text size: of its shorter side; logo width: of its width), so
   the same settings look the same on images of different sizes, and the
   preview and the saved file match. */

export type FontId = "sans" | "serif" | "mono" | "verdana";

/** System fonts only: nothing is downloaded. */
export const FONTS: Record<FontId, {label: string; stack: string}> = {
  sans: {label: "Arial", stack: "Arial, Helvetica, sans-serif"},
  serif: {label: "Georgia", stack: 'Georgia, "Times New Roman", serif'},
  mono: {label: "Courier", stack: '"Courier New", monospace'},
  verdana: {label: "Verdana", stack: "Verdana, Geneva, sans-serif"}
};

export type Anchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "custom";

export interface Watermark {
  kind: "text" | "logo";
  text: string;
  font: FontId;
  bold: boolean;
  colour: string;
  /** Text height as a % of the image's shorter side (1–30). */
  sizePct: number;
  logoId: string | null;
  /** Logo width as a % of the image's width (5–80). */
  logoWidthPct: number;
  /** 0–100. */
  opacity: number;
  /** Degrees, −180 to 180, clockwise. */
  rotation: number;
  anchor: Anchor;
  /** The centre, as a share (0–1) of the image; used when anchor is custom. */
  x: number;
  y: number;
  /** Gap to the edges, as a % of the shorter side (0–20). */
  marginPct: number;
  /** Repeated over the whole image. */
  tiled: boolean;
  /** Gap between repeats, as a % of the shorter side (5–100). */
  spacingPct: number;
}

export const NO_WATERMARK: Watermark | null = null;

export const NEW_WATERMARK: Watermark = {
  kind: "text",
  text: "© Your name",
  font: "sans",
  bold: true,
  colour: "#ffffff",
  sizePct: 6,
  logoId: null,
  logoWidthPct: 25,
  opacity: 70,
  rotation: 0,
  anchor: "bottom-right",
  x: 0.5,
  y: 0.5,
  marginPct: 3,
  tiled: false,
  spacingPct: 15
};

export const MAX_WATERMARK_TEXT = 200;

interface Size {
  width: number;
  height: number;
}

/** The text's font size in pixels, on an image of this size. */
export const fontPx = (w: Watermark, image: Size) =>
  Math.max(
    1,
    Math.round((w.sizePct / 100) * Math.min(image.width, image.height))
  );

/** The CSS font for drawing (and measuring) the text. */
export const fontFor = (w: Watermark, px: number) =>
  `${w.bold ? "bold " : ""}${px}px ${FONTS[w.font].stack}`;

/** The text as it is drawn: one line. */
export const lineOf = (text: string) =>
  text.replace(/\s+/g, " ").trim().slice(0, MAX_WATERMARK_TEXT);

/** The size of one watermark (before turning), given the text's measured
    width or the logo's own size. */
export function itemSize(
  w: Watermark,
  image: Size,
  measured: {textWidth?: number; logo?: Size}
): Size {
  if (w.kind === "logo") {
    const logo = measured.logo ?? {width: 1, height: 1};
    const width = Math.max(1, (w.logoWidthPct / 100) * image.width);
    return {width, height: (width * logo.height) / logo.width};
  }
  const px = fontPx(w, image);
  return {width: Math.max(1, measured.textWidth ?? 0), height: px * 1.2};
}

/** The size of the upright box around an item turned by some degrees. */
export function turnedBounds(item: Size, degrees: number): Size {
  const a = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return {
    width: item.width * c + item.height * s,
    height: item.width * s + item.height * c
  };
}

/** Where the centre of a single (not tiled) watermark goes, in pixels. */
export function placeCentre(
  w: Watermark,
  image: Size,
  item: Size
): {x: number; y: number} {
  if (w.anchor === "custom") {
    return {x: w.x * image.width, y: w.y * image.height};
  }
  const box = turnedBounds(item, w.rotation);
  const margin = (w.marginPct / 100) * Math.min(image.width, image.height);
  const [row, col] =
    w.anchor === "center" ? ["center", "center"] : w.anchor.split("-");
  const along = (side: string | undefined, length: number, size: number) =>
    side === "left" || side === "top"
      ? margin + size / 2
      : side === "right" || side === "bottom"
      ? length - margin - size / 2
      : length / 2;
  return {
    x: along(col, image.width, box.width),
    y: along(row, image.height, box.height)
  };
}

/** The centres of the repeats of a tiled watermark, measured from the
    image's centre before the grid is turned. They cover the image's
    diagonal, so a turned grid leaves no gaps. */
export function tileCentres(
  w: Watermark,
  image: Size,
  item: Size
): {x: number; y: number}[] {
  const gap = (w.spacingPct / 100) * Math.min(image.width, image.height);
  const stepX = item.width + gap;
  const stepY = item.height + gap;
  const reach =
    Math.hypot(image.width, image.height) / 2 + Math.max(stepX, stepY);
  const columns = Math.ceil(reach / stepX);
  const rows = Math.ceil(reach / stepY);
  const out: {x: number; y: number}[] = [];
  for (let r = -rows; r <= rows; r++) {
    // Every other row is shifted by half a step, like bricks.
    const shift = r % 2 === 0 ? 0 : stepX / 2;
    for (let c = -columns; c <= columns; c++) {
      out.push({x: c * stepX + shift, y: r * stepY});
    }
  }
  return out;
}
