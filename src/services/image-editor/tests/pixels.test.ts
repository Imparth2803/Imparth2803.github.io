import {
  applyAdjust,
  applyPointEffects,
  blur,
  blurReach,
  boxRadii,
  colourMatrix,
  NO_ADJUST,
  NO_EFFECTS,
  parseHex,
  pixelate,
  sharpen,
  toneTable
} from "../logic/pixels";

const px = (...values: number[]) => new Uint8ClampedArray(values);
/** A w×h image of random colours (fixed seed), all opaque unless asked. */
function noise(w: number, h: number, alpha?: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 7;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (i & 3) === 3 ? alpha ?? 255 : seed & 255;
  }
  return data;
}

describe("colour adjust", () => {
  it("changes nothing when every setting is 0", () => {
    const data = noise(8, 8);
    const before = data.slice();
    applyAdjust(data, NO_ADJUST);
    expect(data).toEqual(before);
  });

  it("brightens and darkens", () => {
    const data = px(100, 100, 100, 255);
    applyAdjust(data, {...NO_ADJUST, brightness: 20});
    expect(Array.from(data)).toEqual([151, 151, 151, 255]);
    const dark = px(100, 100, 100, 255);
    applyAdjust(dark, {...NO_ADJUST, brightness: -100});
    expect(Array.from(dark)).toEqual([0, 0, 0, 255]);
  });

  it("contrast +100 pushes values to the extremes, −100 to grey", () => {
    const table = toneTable(0, 100);
    expect(table[100]).toBe(0);
    expect(table[160]).toBe(255);
    expect(table[128]).toBe(128);
    const flat = toneTable(0, -100);
    expect(flat[0]).toBe(128);
    expect(flat[255]).toBe(128);
  });

  it("saturation −100 gives grey with the Rec. 709 lightness", () => {
    const data = px(255, 0, 0, 255);
    applyAdjust(data, {...NO_ADJUST, saturation: -100});
    expect(Array.from(data)).toEqual([54, 54, 54, 255]);
  });

  it("hue 0 and 360 change nothing, and greys stay grey", () => {
    const id = colourMatrix(0, 0);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) =>
      expect(id[i]).toBeCloseTo(v, 3)
    );
    const data = px(200, 40, 90, 255);
    applyAdjust(data, {...NO_ADJUST, hue: 360});
    expect(Array.from(data)).toEqual([200, 40, 90, 255]);
    const grey = px(120, 120, 120, 255);
    applyAdjust(grey, {...NO_ADJUST, hue: 135});
    expect(Array.from(grey)).toEqual([120, 120, 120, 255]);
  });

  it("warmth adds red and removes blue; tint removes green", () => {
    const warm = px(100, 100, 100, 255);
    applyAdjust(warm, {...NO_ADJUST, warmth: 50});
    expect(Array.from(warm)).toEqual([115, 100, 85, 255]);
    const tint = px(100, 100, 100, 255);
    applyAdjust(tint, {...NO_ADJUST, tint: 40});
    expect(Array.from(tint)).toEqual([106, 88, 106, 255]);
  });

  it("keeps see-through levels, and leaves fully see-through pixels alone", () => {
    const data = px(10, 20, 30, 0, 100, 100, 100, 128);
    applyAdjust(data, {...NO_ADJUST, brightness: 50, hue: 90});
    expect(Array.from(data.slice(0, 4))).toEqual([10, 20, 30, 0]);
    expect(data[7]).toBe(128);
  });
});

describe("effects", () => {
  it("changes nothing with no effects", () => {
    const data = noise(6, 6);
    const before = data.slice();
    applyPointEffects(data, NO_EFFECTS);
    pixelate(data, 6, 6, 0);
    blur(data, 6, 6, 0);
    sharpen(data, 6, 6, 0);
    expect(data).toEqual(before);
  });

  it("inverts", () => {
    const data = px(0, 100, 255, 200);
    applyPointEffects(data, {...NO_EFFECTS, invert: true});
    expect(Array.from(data)).toEqual([255, 155, 0, 200]);
  });

  it("grayscale 100 on red gives its lightness; 50 goes half way", () => {
    const data = px(255, 0, 0, 255);
    applyPointEffects(data, {...NO_EFFECTS, grayscale: 100});
    expect(Array.from(data)).toEqual([54, 54, 54, 255]);
    const half = px(255, 0, 0, 255);
    applyPointEffects(half, {...NO_EFFECTS, grayscale: 50});
    expect(Array.from(half)).toEqual([155, 27, 27, 255]);
  });

  it("sepia on white gives the standard warm white", () => {
    const data = px(255, 255, 255, 255);
    applyPointEffects(data, {...NO_EFFECTS, sepia: 100});
    expect(Array.from(data)).toEqual([255, 255, 239, 255]);
  });

  it("pixelate makes every block one colour, aligned to the top-left", () => {
    const w = 10;
    const h = 7;
    const data = noise(w, h);
    pixelate(data, w, h, 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const j = (Math.floor(y / 4) * 4 * w + Math.floor(x / 4) * 4) * 4;
        expect(Array.from(data.slice(i, i + 4))).toEqual(
          Array.from(data.slice(j, j + 4))
        );
      }
    }
  });

  it("blur keeps a flat opaque area flat, and keeps it opaque", () => {
    const data = new Uint8ClampedArray(20 * 20 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([40, 120, 200, 255], i);
    const before = data.slice();
    blur(data, 20, 20, 3);
    expect(data).toEqual(before);
  });

  it("blur doesn't darken see-through edges", () => {
    // A white dot on a fully see-through background.
    const w = 9;
    const data = new Uint8ClampedArray(w * w * 4);
    data.set([255, 255, 255, 255], (4 * w + 4) * 4);
    blur(data, w, w, 1.5);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! > 0) {
        expect(data[i]).toBeGreaterThanOrEqual(250);
      }
    }
    expect(data[(4 * w + 4) * 4 + 3]).toBeLessThan(255);
  });

  it("blur spreads a sharp edge", () => {
    const w = 20;
    const data = new Uint8ClampedArray(w * 1 * 4);
    for (let x = 0; x < w; x++) {
      data.set(x < 10 ? [0, 0, 0, 255] : [255, 255, 255, 255], x * 4);
    }
    blur(data, w, 1, 2);
    expect(data[9 * 4]).toBeGreaterThan(60);
    expect(data[10 * 4]).toBeLessThan(195);
    expect(data[0]).toBe(0);
  });

  it("box radii follow the boxes-for-Gauss formula", () => {
    expect(boxRadii(0)).toEqual([0, 0, 0]);
    const radii = boxRadii(5);
    expect(radii).toEqual([4, 4, 5]);
    expect(blurReach(5)).toBe(13);
  });

  it("sharpen leaves flat areas alone and lifts edges", () => {
    const flat = new Uint8ClampedArray(5 * 5 * 4).fill(100);
    for (let i = 3; i < flat.length; i += 4) flat[i] = 255;
    const before = flat.slice();
    sharpen(flat, 5, 5, 80);
    expect(flat).toEqual(before);

    const w = 4;
    const edge = new Uint8ClampedArray(w * 4);
    [50, 50, 200, 200].forEach((v, x) => edge.set([v, v, v, 255], x * 4));
    sharpen(edge, w, 1, 100);
    expect(edge[1 * 4]).toBeLessThan(50);
    expect(edge[2 * 4]).toBeGreaterThan(200);
    expect(edge[3]).toBe(255);
  });

  it("reads hex colours", () => {
    expect(parseHex("#ff8000")).toEqual([255, 128, 0]);
    expect(parseHex("#0f0")).toEqual([0, 255, 0]);
    expect(parseHex("nonsense")).toEqual([0, 0, 0]);
  });
});
