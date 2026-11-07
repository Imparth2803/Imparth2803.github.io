import {
  fontPx,
  itemSize,
  lineOf,
  NEW_WATERMARK,
  placeCentre,
  tileCentres,
  turnedBounds
} from "../logic/watermark";

const image = {width: 1000, height: 500};
const item = {width: 200, height: 60};

describe("watermark placement", () => {
  it("text size is a share of the shorter side", () => {
    expect(fontPx({...NEW_WATERMARK, sizePct: 10}, image)).toBe(50);
    expect(
      fontPx({...NEW_WATERMARK, sizePct: 10}, {width: 2000, height: 1000})
    ).toBe(100);
  });

  it("logo width is a share of the image width, keeping its shape", () => {
    const size = itemSize(
      {...NEW_WATERMARK, kind: "logo", logoWidthPct: 20},
      image,
      {logo: {width: 300, height: 150}}
    );
    expect(size).toEqual({width: 200, height: 100});
  });

  it("places each anchor inside the margin", () => {
    const at = (anchor: typeof NEW_WATERMARK.anchor) =>
      placeCentre(
        {...NEW_WATERMARK, anchor, marginPct: 4, rotation: 0},
        image,
        item
      );
    // Margin: 4% of 500 = 20.
    expect(at("top-left")).toEqual({x: 120, y: 50});
    expect(at("top-center")).toEqual({x: 500, y: 50});
    expect(at("bottom-right")).toEqual({x: 880, y: 450});
    expect(at("center")).toEqual({x: 500, y: 250});
    expect(at("bottom-left")).toEqual({x: 120, y: 450});
  });

  it("a turned watermark stays inside the margin too", () => {
    const w = {
      ...NEW_WATERMARK,
      anchor: "bottom-right" as const,
      marginPct: 0,
      rotation: 90
    };
    const box = turnedBounds(item, 90);
    expect(box.width).toBeCloseTo(60);
    expect(box.height).toBeCloseTo(200);
    const c = placeCentre(w, image, item);
    expect(c.x + box.width / 2).toBeCloseTo(1000);
    expect(c.y + box.height / 2).toBeCloseTo(500);
  });

  it("custom position is a share of the image", () => {
    const w = {...NEW_WATERMARK, anchor: "custom" as const, x: 0.25, y: 0.5};
    expect(placeCentre(w, image, item)).toEqual({x: 250, y: 250});
  });

  it("tiles cover the whole image whatever the angle", () => {
    const w = {...NEW_WATERMARK, tiled: true, spacingPct: 10};
    const tiles = tileCentres(w, image, item);
    const reach = Math.hypot(image.width, image.height) / 2;
    for (const angle of [0, 30, 45, 90, 135]) {
      const a = (angle * Math.PI) / 180;
      // Every corner of the image, seen in the turned grid, is within the
      // tiled area (so no gaps at the corners).
      for (const [cx, cy] of [
        [-500, -250],
        [500, -250],
        [-500, 250],
        [500, 250]
      ] as const) {
        const gx = cx * Math.cos(a) + cy * Math.sin(a);
        const gy = -cx * Math.sin(a) + cy * Math.cos(a);
        const near = tiles.some(
          t =>
            Math.abs(t.x - gx) <= item.width + 50 &&
            Math.abs(t.y - gy) <= item.height + 50
        );
        expect(near).toBe(true);
      }
    }
    expect(Math.max(...tiles.map(t => Math.abs(t.x)))).toBeGreaterThan(reach);
  });

  it("text is drawn as one tidy line", () => {
    expect(lineOf("  © 2026\n  Parth   ")).toBe("© 2026 Parth");
    expect(lineOf("x".repeat(500))).toHaveLength(200);
  });
});
