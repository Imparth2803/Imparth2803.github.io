import {
  centreCrop,
  clampRect,
  Handle,
  resizeBox,
  toImage,
  toScreen
} from "../logic/geometry";

describe("geometry", () => {
  describe("coordinate mapping round-trips", () => {
    const zooms = [0.1, 0.25, 0.33, 0.5, 0.67, 1.0, 1.5, 2.0, 4.0];
    const imageSize = {width: 4000, height: 3000};

    it("round-trips between screen and image space at multiple zooms", () => {
      for (const zoom of zooms) {
        const cssSize = {
          width: Math.round(imageSize.width * zoom),
          height: Math.round(imageSize.height * zoom)
        };
        const testPoints: [number, number][] = [
          [0, 0],
          [cssSize.width / 2, cssSize.height / 2],
          [cssSize.width, cssSize.height],
          [42, 97]
        ];

        for (const pt of testPoints) {
          const imgPt = toImage(pt, cssSize, imageSize);
          const screenPt = toScreen(imgPt, cssSize, imageSize);
          expect(Math.abs(screenPt[0] - pt[0])).toBeLessThanOrEqual(0.01);
          expect(Math.abs(screenPt[1] - pt[1])).toBeLessThanOrEqual(0.01);
        }
      }
    });

    it("handles zero or negative sizes gracefully", () => {
      expect(toImage([10, 10], {width: 0, height: 0}, imageSize)).toEqual([
        0, 0
      ]);
      expect(
        toScreen([10, 10], {width: 100, height: 100}, {width: 0, height: 0})
      ).toEqual([0, 0]);
    });
  });

  describe("clampRect", () => {
    const bounds = {width: 1000, height: 800};

    it("keeps rectangles already inside bounds unchanged", () => {
      const rect = {x: 100, y: 150, width: 400, height: 300};
      expect(clampRect(rect, bounds)).toEqual(rect);
    });

    it("clamps negative coordinates to 0", () => {
      const rect = {x: -50, y: -20, width: 200, height: 200};
      expect(clampRect(rect, bounds)).toEqual({
        x: 0,
        y: 0,
        width: 200,
        height: 200
      });
    });

    it("clamps rectangles that extend past bounds", () => {
      const rect = {x: 900, y: 700, width: 300, height: 200};
      expect(clampRect(rect, bounds)).toEqual({
        x: 700,
        y: 600,
        width: 300,
        height: 200
      });
    });

    it("limits oversized dimensions to bounds", () => {
      const rect = {x: 0, y: 0, width: 1500, height: 1200};
      expect(clampRect(rect, bounds)).toEqual({
        x: 0,
        y: 0,
        width: 1000,
        height: 800
      });
    });
  });

  describe("resizeBox", () => {
    const bounds = {width: 1600, height: 1200};
    const start = {x: 400, y: 300, width: 320, height: 180};
    const ratio = 16 / 9;
    const handles: Handle[] = [
      "top-left",
      "top",
      "top-right",
      "right",
      "bottom-right",
      "bottom",
      "bottom-left",
      "left"
    ];
    const inside = (r: {x: number; y: number; width: number; height: number}) =>
      r.x >= 0 &&
      r.y >= 0 &&
      r.x + r.width <= bounds.width &&
      r.y + r.height <= bounds.height;

    it("keeps the ratio, and the box moves, for every handle", () => {
      for (const handle of handles) {
        const grown = resizeBox(start, handle, 64, 64, bounds, ratio);
        const shrunk = resizeBox(start, handle, -64, -64, bounds, ratio);
        for (const r of [grown, shrunk]) {
          expect(Math.abs(r.height - r.width / ratio)).toBeLessThanOrEqual(1);
          expect(inside(r)).toBe(true);
        }
        expect(grown).not.toEqual(shrunk);
      }
    });

    it("moves only the dragged side without a ratio", () => {
      expect(resizeBox(start, "right", 50, 999, bounds)).toEqual({
        ...start,
        width: 370
      });
      expect(resizeBox(start, "top", 999, -20, bounds)).toEqual({
        ...start,
        y: 280,
        height: 200
      });
    });

    it("keeps the opposite corner fixed", () => {
      const r = resizeBox(start, "top-left", -100, -100, bounds, ratio);
      expect(r.x + r.width).toBe(start.x + start.width);
      expect(r.y + r.height).toBe(start.y + start.height);
      const s = resizeBox(start, "bottom-right", 80, 0, bounds, ratio);
      expect([s.x, s.y]).toEqual([start.x, start.y]);
    });

    it("grows a side handle evenly about the middle with a ratio", () => {
      const r = resizeBox(start, "right", 160, 0, bounds, ratio);
      expect(r.x).toBe(start.x);
      expect(r.width).toBe(480);
      expect(r.height).toBe(270);
      expect(r.y + r.height / 2).toBeCloseTo(start.y + start.height / 2, 0);
    });

    it("stops at the image edge without losing the ratio or the anchor", () => {
      for (const handle of handles) {
        const r = resizeBox(start, handle, -5000, -5000, bounds, ratio);
        const s = resizeBox(start, handle, 5000, 5000, bounds, ratio);
        for (const box of [r, s]) {
          expect(inside(box)).toBe(true);
          expect(Math.abs(box.height - box.width / ratio)).toBeLessThanOrEqual(
            1
          );
        }
      }
      const r = resizeBox(start, "top-left", -5000, -5000, bounds, ratio);
      expect(r.x + r.width).toBe(start.x + start.width);
      expect(r.y + r.height).toBe(start.y + start.height);
    });

    it("never goes below the minimum size", () => {
      const r = resizeBox(
        start,
        "bottom-right",
        -5000,
        -5000,
        bounds,
        null,
        20
      );
      expect([r.width, r.height]).toEqual([20, 20]);
    });
  });

  describe("centreCrop for presets on landscape and portrait", () => {
    const landscape = {width: 1920, height: 1080}; // 16:9
    const portrait = {width: 1080, height: 1920}; // 9:16
    const presets: [string, number][] = [
      ["1:1", 1],
      ["4:5", 4 / 5],
      ["3:2", 3 / 2],
      ["16:9", 16 / 9],
      ["9:16", 9 / 16],
      ["4:3", 4 / 3]
    ];

    it("centres crop presets correctly on landscape images", () => {
      for (const [, ratio] of presets) {
        const crop = centreCrop(landscape, ratio);
        expect(crop.x).toBeGreaterThanOrEqual(0);
        expect(crop.y).toBeGreaterThanOrEqual(0);
        expect(crop.x + crop.width).toBeLessThanOrEqual(landscape.width);
        expect(crop.y + crop.height).toBeLessThanOrEqual(landscape.height);

        // Ratio is respected
        const actualRatio = crop.width / crop.height;
        expect(Math.abs(actualRatio - ratio)).toBeLessThan(0.01);

        // Centred: margins on opposite sides should be equal or differ by at most 1 px
        const rightMargin = landscape.width - (crop.x + crop.width);
        const bottomMargin = landscape.height - (crop.y + crop.height);
        expect(Math.abs(crop.x - rightMargin)).toBeLessThanOrEqual(1);
        expect(Math.abs(crop.y - bottomMargin)).toBeLessThanOrEqual(1);
      }
    });

    it("centres crop presets correctly on portrait images", () => {
      for (const [, ratio] of presets) {
        const crop = centreCrop(portrait, ratio);
        expect(crop.x).toBeGreaterThanOrEqual(0);
        expect(crop.y).toBeGreaterThanOrEqual(0);
        expect(crop.x + crop.width).toBeLessThanOrEqual(portrait.width);
        expect(crop.y + crop.height).toBeLessThanOrEqual(portrait.height);

        const actualRatio = crop.width / crop.height;
        expect(Math.abs(actualRatio - ratio)).toBeLessThan(0.01);

        const rightMargin = portrait.width - (crop.x + crop.width);
        const bottomMargin = portrait.height - (crop.y + crop.height);
        expect(Math.abs(crop.x - rightMargin)).toBeLessThanOrEqual(1);
        expect(Math.abs(crop.y - bottomMargin)).toBeLessThanOrEqual(1);
      }
    });
  });
});
