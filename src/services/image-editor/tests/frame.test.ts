import {framedSize, isFramed, NO_FRAME} from "../logic/frame";

describe("framedSize", () => {
  it("returns original size when frame has zero border and padding", () => {
    expect(framedSize(800, 600, NO_FRAME)).toEqual({width: 800, height: 600});
    expect(isFramed(NO_FRAME)).toBe(false);
  });

  it("calculates output size with border only", () => {
    const frame = {
      ...NO_FRAME,
      border: 10
    };
    // W + 2*10, H + 2*10
    expect(framedSize(800, 600, frame)).toEqual({width: 820, height: 620});
    expect(isFramed(frame)).toBe(true);
  });

  it("calculates output size with equal padding only", () => {
    const frame = {
      ...NO_FRAME,
      padding: {top: 20, right: 20, bottom: 20, left: 20}
    };
    // W + 20 + 20, H + 20 + 20
    expect(framedSize(800, 600, frame)).toEqual({width: 840, height: 640});
    expect(isFramed(frame)).toBe(true);
  });

  it("calculates output size with asymmetric padding and border", () => {
    const frame = {
      ...NO_FRAME,
      border: 5,
      padding: {top: 10, right: 20, bottom: 30, left: 40}
    };
    // W + 2*5 + 20 + 40 = 800 + 10 + 60 = 870
    // H + 2*5 + 10 + 30 = 600 + 10 + 40 = 650
    expect(framedSize(800, 600, frame)).toEqual({width: 870, height: 650});
  });

  it("handles decimal inputs by rounding", () => {
    const frame = {
      ...NO_FRAME,
      border: 4.6, // rounds to 5
      padding: {top: 9.8, right: 10.2, bottom: 0, left: 0} // 10 and 10
    };
    expect(framedSize(100, 100, frame)).toEqual({
      width: 100 + 2 * 5 + 10, // 120
      height: 100 + 2 * 5 + 10 // 120
    });
  });
});
