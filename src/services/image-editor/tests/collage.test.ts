import {fitInto, gridOf, LAYOUTS, planCollage, split} from "../logic/collage";

const base = {
  count: 4,
  width: 2000,
  height: 2000,
  gap: 10,
  margin: 20,
  captionPct: 0
};

describe("collage layouts", () => {
  it("spreads leftover pixels one each from the first column", () => {
    expect(split(10, 3)).toEqual([4, 3, 3]);
    expect(split(9, 3)).toEqual([3, 3, 3]);
  });

  it("works out rows and columns for every grid layout", () => {
    expect(gridOf({...base, layout: "cols2", count: 5})).toEqual({
      cols: 2,
      rows: 3
    });
    expect(gridOf({...base, layout: "cols3", count: 7})).toEqual({
      cols: 3,
      rows: 3
    });
    expect(gridOf({...base, layout: "grid2"})).toEqual({cols: 2, rows: 2});
    expect(gridOf({...base, layout: "grid3"})).toEqual({cols: 3, rows: 3});
    expect(gridOf({...base, layout: "custom", rows: 4, cols: 12})).toEqual({
      rows: 4,
      cols: 10
    });
  });

  it("sizes grid cells to fill the output exactly", () => {
    for (const {id} of LAYOUTS.filter(l => !l.id.endsWith("strip"))) {
      const plan = planCollage({
        ...base,
        layout: id,
        width: 1001,
        height: 997,
        rows: 3,
        cols: 3
      });
      const {rows, cols} = gridOf({...base, layout: id, rows: 3, cols: 3});
      expect(plan.cells).toHaveLength(rows * cols);
      const lastInRow = plan.cells[cols - 1]!.cell;
      expect(lastInRow.x + lastInRow.width + base.margin).toBe(1001);
      const lastRow = plan.cells[plan.cells.length - 1]!.cell;
      expect(lastRow.y + lastRow.height + base.margin).toBe(997);
      expect(plan.cells[0]!.cell).toMatchObject({x: 20, y: 20});
    }
  });

  it("2 × 2 with no gap or margin is four equal quarters", () => {
    const plan = planCollage({
      ...base,
      layout: "grid2",
      width: 400,
      height: 400,
      gap: 0,
      margin: 0
    });
    expect(plan.cells.map(c => c.cell)).toEqual([
      {x: 0, y: 0, width: 200, height: 200},
      {x: 200, y: 0, width: 200, height: 200},
      {x: 0, y: 200, width: 200, height: 200},
      {x: 200, y: 200, width: 200, height: 200}
    ]);
  });

  it("strips keep each picture's shape", () => {
    const aspects = [2, 0.5, 1];
    const h = planCollage({
      ...base,
      layout: "hstrip",
      count: 3,
      stripSize: 300,
      aspects
    });
    expect(h.cells.map(c => [c.cell.width, c.cell.height])).toEqual([
      [600, 300],
      [150, 300],
      [300, 300]
    ]);
    expect(h.width).toBe(20 + 600 + 10 + 150 + 10 + 300 + 20);
    expect(h.height).toBe(340);
    const v = planCollage({
      ...base,
      layout: "vstrip",
      count: 3,
      stripSize: 300,
      aspects
    });
    expect(v.cells.map(c => [c.cell.width, c.cell.height])).toEqual([
      [300, 150],
      [300, 600],
      [300, 300]
    ]);
    expect(v.height).toBe(20 + 150 + 10 + 600 + 10 + 300 + 20);
  });

  it("captions get their own band, so they never cover the picture", () => {
    const plan = planCollage({
      ...base,
      layout: "grid2",
      width: 420,
      height: 420,
      gap: 0,
      margin: 10,
      captionPct: 10
    });
    const c = plan.cells[0]!;
    expect(c.picture.height + c.caption!.height).toBe(c.cell.height);
    expect(c.caption!.y).toBe(c.picture.y + c.picture.height);
    // With captions, a strip picture still keeps its shape.
    const s = planCollage({
      ...base,
      layout: "hstrip",
      count: 1,
      stripSize: 200,
      aspects: [1.5],
      captionPct: 25
    });
    expect(s.cells[0]!.picture.width / s.cells[0]!.picture.height).toBeCloseTo(
      1.5,
      1
    );
  });
});

describe("fitting a picture into a cell", () => {
  const box = {x: 0, y: 0, width: 400, height: 400};

  it("contain shows all of a portrait picture, centred", () => {
    const {source, target} = fitInto({width: 200, height: 400}, box, "contain");
    expect(source).toEqual({x: 0, y: 0, width: 200, height: 400});
    expect(target).toEqual({x: 100, y: 0, width: 200, height: 400});
  });

  it("cover fills the cell and cuts the edges evenly, never stretching", () => {
    const {source, target} = fitInto({width: 800, height: 400}, box, "cover");
    expect(target).toEqual(box);
    expect(source).toEqual({x: 200, y: 0, width: 400, height: 400});
    expect(source.width / source.height).toBeCloseTo(
      target.width / target.height
    );
  });
});
