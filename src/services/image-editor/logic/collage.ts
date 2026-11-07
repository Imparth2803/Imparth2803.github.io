/* Collage layouts: where each picture goes. Pure maths, so it can be tested
   and shared by the preview and the saved file. */

export type CollageLayout =
  | "cols2"
  | "cols3"
  | "grid2"
  | "grid3"
  | "hstrip"
  | "vstrip"
  | "custom";

export const LAYOUTS: {id: CollageLayout; label: string}[] = [
  {id: "cols2", label: "2 columns"},
  {id: "cols3", label: "3 columns"},
  {id: "grid2", label: "2 × 2 grid"},
  {id: "grid3", label: "3 × 3 grid"},
  {id: "hstrip", label: "Side by side (strip)"},
  {id: "vstrip", label: "One above another (strip)"},
  {id: "custom", label: "Custom grid"}
];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Cell {
  /** The whole cell. */
  cell: Rect;
  /** Where the picture goes (the cell, less any caption band). */
  picture: Rect;
  /** The caption band under the picture, when captions are on. */
  caption: Rect | null;
}

export interface CollagePlan {
  cells: Cell[];
  width: number;
  height: number;
}

export interface PlanInput {
  layout: CollageLayout;
  /** How many pictures there are. */
  count: number;
  /** Output size, for grid layouts. */
  width: number;
  height: number;
  gap: number;
  margin: number;
  /** Caption band, as a % of each cell's height (0 = no captions). */
  captionPct: number;
  /** For "custom". */
  rows?: number;
  cols?: number;
  /** For strips: the strip's height (side by side) or width (one above
      another), in pixels. */
  stripSize?: number;
  /** Each picture's width ÷ height, for strips. */
  aspects?: number[];
}

/** The rows and columns of a grid layout. */
export function gridOf(input: PlanInput): {rows: number; cols: number} {
  const n = Math.max(1, input.count);
  switch (input.layout) {
    case "cols2":
      return {cols: 2, rows: Math.ceil(n / 2)};
    case "cols3":
      return {cols: 3, rows: Math.ceil(n / 3)};
    case "grid2":
      return {cols: 2, rows: 2};
    case "grid3":
      return {cols: 3, rows: 3};
    default: {
      const clamp = (v: number | undefined) =>
        Math.min(10, Math.max(1, Math.round(v ?? 2)));
      return {rows: clamp(input.rows), cols: clamp(input.cols)};
    }
  }
}

/** Splits a length into `parts` whole-pixel pieces; the leftover pixels
    go one each to the first pieces. */
export function split(length: number, parts: number): number[] {
  const each = Math.floor(length / parts);
  const extra = length - each * parts;
  return Array.from({length: parts}, (_, i) => each + (i < extra ? 1 : 0));
}

function withCaption(cell: Rect, captionPct: number): Cell {
  const band =
    captionPct > 0 ? Math.round((cell.height * captionPct) / 100) : 0;
  return {
    cell,
    picture: {...cell, height: cell.height - band},
    caption:
      band > 0 ? {...cell, y: cell.y + cell.height - band, height: band} : null
  };
}

export function planCollage(input: PlanInput): CollagePlan {
  const gap = Math.max(0, Math.round(input.gap));
  const margin = Math.max(0, Math.round(input.margin));
  const captionPct = Math.min(40, Math.max(0, input.captionPct));

  if (input.layout === "hstrip" || input.layout === "vstrip") {
    // Each picture keeps its shape: one side is the strip size, the other
    // follows the picture.
    const size = Math.max(1, Math.round(input.stripSize ?? 600));
    const aspects = (input.aspects ?? []).slice(0, input.count);
    const keep = 1 - captionPct / 100;
    const cells: Cell[] = [];
    let at = margin;
    for (const a of aspects) {
      const aspect = a > 0 && Number.isFinite(a) ? a : 1;
      const cell =
        input.layout === "hstrip"
          ? {
              x: at,
              y: margin,
              width: Math.max(1, Math.round(size * keep * aspect)),
              height: size
            }
          : {
              x: margin,
              y: at,
              width: size,
              height: Math.max(1, Math.round(size / aspect / keep))
            };
      cells.push(withCaption(cell, captionPct));
      at += (input.layout === "hstrip" ? cell.width : cell.height) + gap;
    }
    const length = cells.length ? at - gap + margin : 2 * margin + 1;
    return input.layout === "hstrip"
      ? {cells, width: length, height: size + 2 * margin}
      : {cells, width: size + 2 * margin, height: length};
  }

  const {rows, cols} = gridOf(input);
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  const widths = split(
    Math.max(cols, width - 2 * margin - (cols - 1) * gap),
    cols
  );
  const heights = split(
    Math.max(rows, height - 2 * margin - (rows - 1) * gap),
    rows
  );
  const cells: Cell[] = [];
  let y = margin;
  for (let r = 0; r < rows; r++) {
    let x = margin;
    for (let c = 0; c < cols; c++) {
      cells.push(
        withCaption({x, y, width: widths[c]!, height: heights[r]!}, captionPct)
      );
      x += widths[c]! + gap;
    }
    y += heights[r]! + gap;
  }
  return {cells, width, height};
}

/** Where a picture of this size is drawn in a box: "contain" shows all of
    it (centred), "cover" fills the box and cuts the edges evenly. Never
    stretched. Returns the part of the picture used and where it goes. */
export function fitInto(
  picture: {width: number; height: number},
  box: Rect,
  fit: "contain" | "cover"
): {source: Rect; target: Rect} {
  const {width: pw, height: ph} = picture;
  if (fit === "contain") {
    const s = Math.min(box.width / pw, box.height / ph);
    const w = pw * s;
    const h = ph * s;
    return {
      source: {x: 0, y: 0, width: pw, height: ph},
      target: {
        x: box.x + (box.width - w) / 2,
        y: box.y + (box.height - h) / 2,
        width: w,
        height: h
      }
    };
  }
  const s = Math.max(box.width / pw, box.height / ph);
  const sw = box.width / s;
  const sh = box.height / s;
  return {
    source: {x: (pw - sw) / 2, y: (ph - sh) / 2, width: sw, height: sh},
    target: {...box}
  };
}
