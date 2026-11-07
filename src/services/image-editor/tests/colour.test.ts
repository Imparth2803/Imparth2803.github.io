import {palette, toHex, toHsl, toRgb} from "../logic/colour";

describe("colour formats", () => {
  it("writes HEX, with see-through as a fourth pair", () => {
    expect(toHex([255, 128, 0, 255])).toBe("#FF8000");
    expect(toHex([0, 0, 0, 128])).toBe("#00000080");
  });

  it("writes RGB and RGBA", () => {
    expect(toRgb([12, 34, 56, 255])).toBe("rgb(12, 34, 56)");
    expect(toRgb([12, 34, 56, 0])).toBe("rgba(12, 34, 56, 0)");
    expect(toRgb([12, 34, 56, 128])).toBe("rgba(12, 34, 56, 0.5)");
  });

  it("writes HSL, rounded", () => {
    expect(toHsl([255, 0, 0, 255])).toBe("hsl(0, 100%, 50%)");
    expect(toHsl([0, 128, 0, 255])).toBe("hsl(120, 100%, 25%)");
    expect(toHsl([79, 70, 229, 255])).toBe("hsl(243, 75%, 59%)");
    expect(toHsl([128, 128, 128, 255])).toBe("hsl(0, 0%, 50%)");
    expect(toHsl([255, 255, 255, 51])).toBe("hsla(0, 0%, 100%, 0.2)");
  });
});

describe("palette", () => {
  const image = (colours: [number, number, number, number, number][]) => {
    const px: number[] = [];
    for (const [r, g, b, a, n] of colours) {
      for (let i = 0; i < n; i++) px.push(r, g, b, a);
    }
    return new Uint8ClampedArray(px);
  };

  it("finds the main colours, most common first", () => {
    const data = image([
      [250, 0, 0, 255, 500],
      [0, 0, 250, 255, 300],
      [0, 250, 0, 255, 100]
    ]);
    expect(palette(data, 3)).toEqual(["#FA0000", "#0000FA", "#00FA00"]);
  });

  it("skips mostly see-through pixels", () => {
    const data = image([
      [250, 0, 0, 255, 10],
      [0, 0, 250, 20, 1000]
    ]);
    expect(palette(data)).toEqual(["#FA0000"]);
  });

  it("is the same every time", () => {
    const data = new Uint8ClampedArray(4000);
    for (let i = 0; i < data.length; i++)
      data[i] = (i * 37) % 256 | (i % 4 === 3 ? 255 : 0);
    expect(palette(data)).toEqual(palette(data));
    expect(palette(data).length).toBeLessThanOrEqual(6);
  });
});
