export type FitMode = "contain" | "cover" | "stretch";

/** The size asked for: a box (one side may be left empty) or a percentage. */
export type SizeChoice =
  | {kind: "box"; width: number | null; height: number | null}
  | {kind: "percent"; percent: number};

export type Box = [number, number, number, number];

export interface Plan {
  width: number;
  height: number;
  /** The part of the image to use, and where it goes on the new canvas. */
  from: Box;
  to: Box;
  cropped: boolean;
  stretched: boolean;
  padded: boolean;
  enlarged: boolean;
}

/* Works out the new size and how the image fits into it.
   - Contain: the whole image fits inside; empty space is padded. Never
     distorted or cropped.
   - Cover: the image fills the size; the overflow is cropped evenly.
   - Stretch: the image is forced to the size and may be distorted.
   With one side or a percentage, the image keeps its shape. */
export function planResize(
  w: number,
  h: number,
  size: SizeChoice,
  mode: FitMode
): Plan {
  const whole: Box = [0, 0, w, h];
  const simple = (width: number, height: number): Plan => {
    const W = Math.max(1, Math.round(width));
    const H = Math.max(1, Math.round(height));
    return {
      width: W,
      height: H,
      from: whole,
      to: [0, 0, W, H],
      cropped: false,
      stretched: false,
      padded: false,
      enlarged: W > w || H > h
    };
  };

  if (size.kind === "percent")
    return simple((w * size.percent) / 100, (h * size.percent) / 100);
  const {width, height} = size;
  if (width === null && height === null) throw new Error("No size given");
  if (height === null) return simple(width!, (h * width!) / w);
  if (width === null) return simple((w * height) / h, height);

  const W = width;
  const H = height;
  if (mode === "stretch") {
    const stretched = Math.abs(W / H - w / h) / (w / h) > 0.01;
    return {
      width: W,
      height: H,
      from: whole,
      to: [0, 0, W, H],
      cropped: false,
      stretched,
      padded: false,
      enlarged: W > w || H > h
    };
  }
  if (mode === "contain") {
    const scale = Math.min(W / w, H / h);
    const dw = Math.min(W, Math.max(1, Math.round(w * scale)));
    const dh = Math.min(H, Math.max(1, Math.round(h * scale)));
    const dx = Math.floor((W - dw) / 2);
    const dy = Math.floor((H - dh) / 2);
    return {
      width: W,
      height: H,
      from: whole,
      to: [dx, dy, dw, dh],
      cropped: false,
      stretched: false,
      padded: dw < W || dh < H,
      enlarged: scale > 1
    };
  }
  const scale = Math.max(W / w, H / h);
  const sw = Math.min(w, W / scale);
  const sh = Math.min(h, H / scale);
  return {
    width: W,
    height: H,
    from: [(w - sw) / 2, (h - sh) / 2, sw, sh],
    to: [0, 0, W, H],
    cropped: sw < w - 0.5 || sh < h - 0.5,
    stretched: false,
    padded: false,
    enlarged: scale > 1
  };
}

export const PRESETS: {label: string; width: number; height: number}[] = [
  {label: "100 × 100", width: 100, height: 100},
  {label: "300 × 300", width: 300, height: 300},
  {label: "500 × 500", width: 500, height: 500},
  {label: "1080 × 1080 (square post)", width: 1080, height: 1080},
  {label: "1920 × 1080 (full HD)", width: 1920, height: 1080}
];
