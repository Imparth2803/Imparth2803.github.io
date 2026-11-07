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
