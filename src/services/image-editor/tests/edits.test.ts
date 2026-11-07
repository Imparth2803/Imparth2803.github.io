import {
  angleOf,
  flip,
  NO_EDITS,
  NO_TRANSFORM,
  sameEdits,
  straighten,
  Transform,
  transformedSize,
  turn
} from "../logic/edits";
import {commit, redo, start, undo} from "../logic/history";

/* Where a point of the original lands: flipped first, then turned (the
   order the editor draws in). */
function place(t: Transform, [x, y]: [number, number]): [number, number] {
  const fx = t.flipX ? -x : x;
  const fy = t.flipY ? -y : y;
  const a = (angleOf(t) * Math.PI) / 180;
  return [
    fx * Math.cos(a) - fy * Math.sin(a),
    fx * Math.sin(a) + fy * Math.cos(a)
  ];
}
const close = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

const states: Transform[] = [];
for (const quarter of [0, 1, 2, 3] as const)
  for (const fine of [0, 12.5, -30])
    for (const flipX of [false, true])
      for (const flipY of [false, true])
        states.push({quarter, fine, flipX, flipY});

describe("rotate and flip", () => {
  const point: [number, number] = [3, 1];

  it("mirrors the picture as seen on screen, whatever it was turned by", () => {
    for (const t of states) {
      const [x, y] = place(t, point);
      expect(close(place(flip(t, "x"), point), [-x, y])).toBe(true);
      expect(close(place(flip(t, "y"), point), [x, -y])).toBe(true);
    }
  });

  it("turns the picture as seen on screen by a quarter", () => {
    for (const t of states) {
      const [x, y] = place(t, point);
      // Clockwise on screen (y points down): (x, y) -> (−y, x).
      expect(close(place(turn(t, 1), point), [-y, x])).toBe(true);
      expect(close(place(turn(t, -1), point), [y, -x])).toBe(true);
      expect(close(place(turn(t, 2), point), [-x, -y])).toBe(true);
    }
  });

  it("comes back to the start after four turns or two flips", () => {
    let t = NO_TRANSFORM;
    for (let i = 0; i < 4; i++) t = turn(t, 1);
    expect(t).toEqual(NO_TRANSFORM);
    expect(flip(flip(NO_TRANSFORM, "x"), "x")).toEqual(NO_TRANSFORM);
  });

  it("swaps width and height for quarter turns, and never cuts corners off", () => {
    expect(transformedSize(400, 300, turn(NO_TRANSFORM, 1))).toEqual({
      width: 300,
      height: 400
    });
    expect(transformedSize(400, 300, turn(NO_TRANSFORM, 2))).toEqual({
      width: 400,
      height: 300
    });
    // 45°: the whole picture fits in the larger box.
    expect(transformedSize(100, 100, straighten(NO_TRANSFORM, 45))).toEqual({
      width: 142,
      height: 142
    });
  });

  it("keeps straightening between −45° and 45°, in tenths", () => {
    expect(straighten(NO_TRANSFORM, 80).fine).toBe(45);
    expect(straighten(NO_TRANSFORM, -3.14159).fine).toBe(-3.1);
    expect(straighten(NO_TRANSFORM, NaN).fine).toBe(0);
  });
});

describe("undo and redo", () => {
  const a = NO_EDITS;
  const b = {transform: turn(NO_TRANSFORM, 1)};
  const c = {transform: flip(NO_TRANSFORM, "x")};

  it("steps back and forward through changes", () => {
    let h = commit(commit(start(a), b, sameEdits), c, sameEdits);
    h = undo(h);
    expect(h.present).toBe(b);
    h = undo(h);
    expect(h.present).toBe(a);
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present).toBe(b);
    // A new change after undoing drops the steps that were undone.
    h = commit(h, c, sameEdits);
    expect(h.future).toEqual([]);
    expect(h.past).toEqual([a, b]);
  });

  it("doesn't record a change that changes nothing", () => {
    const h = start(a);
    expect(commit(h, {transform: {...NO_TRANSFORM}}, sameEdits)).toBe(h);
  });

  it("keeps the last 100 steps", () => {
    let h = start(a);
    for (let i = 1; i <= 150; i++)
      h = commit(
        h,
        {transform: straighten(NO_TRANSFORM, (i % 80) - 40)},
        (x, y) => x === y
      );
    expect(h.past).toHaveLength(100);
  });
});

describe("Stage 3 edits extensions", () => {
  const {
    addsEmptyAreas,
    noticeForEarlierChange,
    previewEditsFor,
    resultSize,
    withEarlierChange
  } = require("../logic/edits");

  it("detects when empty/see-through areas are added", () => {
    expect(addsEmptyAreas(NO_EDITS)).toBe(false);

    // Fine rotation adds empty corners
    expect(
      addsEmptyAreas({
        ...NO_EDITS,
        transform: straighten(NO_TRANSFORM, 10)
      })
    ).toBe(true);

    // Circle crop adds see-through corners
    expect(
      addsEmptyAreas({
        ...NO_EDITS,
        crop: {x: 10, y: 10, width: 100, height: 100, shape: "circle"}
      })
    ).toBe(true);

    // Rect crop does not add see-through areas on its own
    expect(
      addsEmptyAreas({
        ...NO_EDITS,
        crop: {x: 10, y: 10, width: 100, height: 100, shape: "rect"}
      })
    ).toBe(false);

    // Transparent padding adds see-through areas
    expect(
      addsEmptyAreas({
        ...NO_EDITS,
        frame: {
          padding: {top: 10, right: 0, bottom: 0, left: 0},
          paddingColour: "transparent",
          border: 0,
          borderColour: "#000000"
        }
      })
    ).toBe(true);

    // Solid padding does not add see-through areas
    expect(
      addsEmptyAreas({
        ...NO_EDITS,
        frame: {
          padding: {top: 10, right: 0, bottom: 0, left: 0},
          paddingColour: "#ffffff",
          border: 0,
          borderColour: "#000000"
        }
      })
    ).toBe(false);
  });

  it("calculates resultSize across transform, crop, and frame", () => {
    // 400x300, quarter turn 1 -> 300x400
    const turned = {
      ...NO_EDITS,
      transform: turn(NO_TRANSFORM, 1)
    };
    expect(resultSize(400, 300, turned)).toEqual({width: 300, height: 400});

    // then cropped to 200x200
    const cropped = {
      ...turned,
      crop: {x: 50, y: 50, width: 200, height: 200, shape: "rect" as const}
    };
    expect(resultSize(400, 300, cropped)).toEqual({width: 200, height: 200});

    // then framed with border 5 and padding 10 on all sides
    const framed = {
      ...cropped,
      frame: {
        border: 5,
        borderColour: "#000000",
        padding: {top: 10, right: 10, bottom: 10, left: 10},
        paddingColour: "#ffffff"
      }
    };
    // 200 + 2*5 + 20 = 230
    expect(resultSize(400, 300, framed)).toEqual({width: 230, height: 230});
  });

  it("resets dependent crop when transform changes (invalidation rule)", () => {
    const prev = {
      ...NO_EDITS,
      crop: {x: 10, y: 10, width: 100, height: 100, shape: "rect" as const}
    };
    const next = {
      ...prev,
      transform: turn(prev.transform, 1)
    };
    const updated = withEarlierChange(prev, next);
    expect(updated.crop).toBeNull();
    expect(noticeForEarlierChange(prev, next)).toBe(
      "Turning the image removed the crop. Press Undo to bring it back."
    );

    // If transform did not change, crop is kept
    const cropChange = {
      ...prev,
      crop: {x: 20, y: 20, width: 150, height: 150, shape: "rect" as const}
    };
    expect(withEarlierChange(prev, cropChange).crop).toEqual(cropChange.crop);
    expect(noticeForEarlierChange(prev, cropChange)).toBeNull();
  });

  it("provides previewEditsFor specific tools", () => {
    const edits = {
      transform: turn(NO_TRANSFORM, 1),
      crop: {x: 10, y: 10, width: 100, height: 100, shape: "rect" as const},
      frame: {
        border: 10,
        borderColour: "#000000",
        padding: {top: 10, right: 10, bottom: 10, left: 10},
        paddingColour: "#ffffff"
      }
    };

    // Crop tool hides crop and frame
    const forCrop = previewEditsFor("crop", edits);
    expect(forCrop.crop).toBeNull();
    expect(forCrop.frame.border).toBe(0);
    expect(forCrop.transform).toEqual(edits.transform);

    // Other tools see full edits
    expect(previewEditsFor("transform", edits)).toEqual(edits);
    expect(previewEditsFor("save", edits)).toEqual(edits);
  });
});

describe("Stage 3 review fixes", () => {
  const {noticeForEarlierChange, withEarlierChange} = require("../logic/edits");
  const cropped = {
    ...NO_EDITS,
    crop: {x: 0, y: 0, width: 50, height: 50, shape: "rect" as const}
  };

  it("says flipping, not turning, when a flip removes the crop", () => {
    const next = {...cropped, transform: flip(NO_TRANSFORM, "x")};
    expect(withEarlierChange(cropped, next).crop).toBeNull();
    expect(noticeForEarlierChange(cropped, next)).toBe(
      "Flipping the image removed the crop. Press Undo to bring it back."
    );
  });

  it("gives no notice when there was no crop to remove", () => {
    const old = {transform: NO_TRANSFORM};
    const next = {transform: turn(NO_TRANSFORM, 1)};
    expect(noticeForEarlierChange(old, next)).toBeNull();
    expect(withEarlierChange(old, next)).toBe(next);
  });
});

describe("Stage 4: hidden areas and watermark follow earlier changes", () => {
  const {
    noticeForEarlierChange,
    previewEditsFor,
    sameEdits: same,
    withEarlierChange
  } = require("../logic/edits");
  const {NEW_WATERMARK} = require("../logic/watermark");
  const area = {
    id: 1,
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.2,
    kind: "solid" as const,
    colour: "#000000"
  };
  const base = {
    ...NO_EDITS,
    redactions: [area],
    watermark: {...NEW_WATERMARK, anchor: "custom", x: 0.2, y: 0.3}
  };

  it("turning clears the hidden areas and the dragged watermark position", () => {
    const next = {...base, transform: turn(NO_TRANSFORM, 1)};
    const out = withEarlierChange(base, next);
    expect(out.redactions).toEqual([]);
    expect(out.watermark.anchor).toBe("center");
    expect(out.watermark.text).toBe(NEW_WATERMARK.text);
    expect(noticeForEarlierChange(base, next)).toBe(
      "Turning the image removed the hidden areas and the watermark's position. Press Undo to bring them back."
    );
  });

  it("a new crop clears them too, but other changes keep them", () => {
    const crop = {x: 0, y: 0, width: 10, height: 10, shape: "rect" as const};
    const next = {...base, crop};
    expect(withEarlierChange(base, next).redactions).toEqual([]);
    expect(noticeForEarlierChange(base, next)).toBe(
      "Changing the crop removed the hidden areas and the watermark's position. Press Undo to bring them back."
    );
    const brighter = {
      ...base,
      adjust: {...NO_EDITS.adjust, brightness: 10}
    };
    expect(withEarlierChange(base, brighter)).toBe(brighter);
    expect(noticeForEarlierChange(base, brighter)).toBeNull();
  });

  it("lists everything removed in one notice", () => {
    const withCrop = {
      ...base,
      crop: {x: 0, y: 0, width: 10, height: 10, shape: "rect" as const}
    };
    const next = {...withCrop, transform: turn(NO_TRANSFORM, 1)};
    expect(noticeForEarlierChange(withCrop, next)).toBe(
      "Turning the image removed the crop, the hidden areas and the watermark's position. Press Undo to bring them back."
    );
  });

  it("the crop tool shows the image without hidden areas or watermark", () => {
    const shown = previewEditsFor("crop", base);
    expect(shown.redactions).toEqual([]);
    expect(shown.watermark).toBeNull();
    expect(previewEditsFor("adjust", base)).toBe(base);
  });

  it("old-style edits compare equal to the full defaults", () => {
    expect(same({transform: NO_TRANSFORM}, NO_EDITS)).toBe(true);
    expect(same(base, {...base, redactions: []})).toBe(false);
  });
});

describe("Stage 4: hidden areas in pixels", () => {
  const {redactionRect} = require("../worker/pipeline");
  const r = (x: number, y: number, w: number, h: number) => ({
    id: 1,
    x,
    y,
    w,
    h,
    kind: "solid",
    colour: "#000"
  });

  it("rounds outwards so the area is fully covered", () => {
    expect(redactionRect(r(0.105, 0.2, 0.3, 0.101), 100, 100)).toEqual({
      x: 10,
      y: 20,
      width: 31,
      height: 11
    });
  });

  it("keeps exact pixel edges exact (no extra pixel from rounding)", () => {
    const W = 1600;
    expect(redactionRect(r(464 / W, 29 / W, 290 / W, 87 / W), W, W)).toEqual({
      x: 464,
      y: 29,
      width: 290,
      height: 87
    });
  });

  it("stays inside the image", () => {
    expect(redactionRect(r(0.9, -0.1, 0.5, 0.3), 100, 50)).toEqual({
      x: 90,
      y: 0,
      width: 10,
      height: 10
    });
  });
});

describe("Stage 6: resize in the editor", () => {
  const {
    addsEmptyAreas: empty,
    noticeForEarlierChange,
    previewEditsFor,
    resultSize,
    withEarlierChange
  } = require("../logic/edits");
  const box = (width: number | null, height: number | null) => ({
    kind: "box" as const,
    width,
    height
  });
  const area = {
    id: 1,
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.2,
    kind: "solid" as const,
    colour: "#000000"
  };

  it("sizes the result after crop, then resize, then border", () => {
    const edits = {
      ...NO_EDITS,
      crop: {x: 0, y: 0, width: 1600, height: 900, shape: "rect" as const},
      resize: {choice: box(800, null), fit: "contain"}
    };
    expect(resultSize(1600, 1200, edits)).toEqual({width: 800, height: 450});
    const framed = {
      ...edits,
      frame: {...NO_EDITS.frame, border: 10}
    };
    expect(resultSize(1600, 1200, framed)).toEqual({width: 820, height: 470});
    const half = {
      ...NO_EDITS,
      resize: {choice: {kind: "percent", percent: 50}, fit: "contain"}
    };
    expect(resultSize(1600, 1200, half)).toEqual({width: 800, height: 600});
  });

  it("counts Contain padding as see-through space (for the JPG warning)", () => {
    const padded = {
      ...NO_EDITS,
      resize: {choice: box(500, 500), fit: "contain"}
    };
    expect(empty(padded, {width: 1600, height: 1200})).toBe(true);
    const covered = {
      ...NO_EDITS,
      resize: {choice: box(500, 500), fit: "cover"}
    };
    expect(empty(covered, {width: 1600, height: 1200})).toBe(false);
    // Without the image size, only the other reasons count (as before).
    expect(empty(padded)).toBe(false);
  });

  it("a resize that moves the picture clears hidden areas; keeping the shape doesn't", () => {
    const base = {...NO_EDITS, redactions: [area]};
    const contain = {...base, resize: {choice: box(500, 500), fit: "contain"}};
    expect(withEarlierChange(base, contain).redactions).toEqual([]);
    expect(noticeForEarlierChange(base, contain)).toBe(
      "Changing the size removed the hidden areas. Press Undo to bring them back."
    );
    const narrower = {
      ...base,
      resize: {choice: box(800, null), fit: "contain"}
    };
    expect(withEarlierChange(base, narrower)).toBe(narrower);
    const stretched = {
      ...base,
      resize: {choice: box(500, 500), fit: "stretch"}
    };
    expect(withEarlierChange(base, stretched)).toBe(stretched);
  });

  it("the crop tool shows the image before resizing", () => {
    const edits = {
      ...NO_EDITS,
      resize: {choice: box(800, null), fit: "contain"}
    };
    expect(previewEditsFor("crop", edits).resize).toBeNull();
    expect(previewEditsFor("resize", edits)).toBe(edits);
  });
});
