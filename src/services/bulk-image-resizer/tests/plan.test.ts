import {planResize} from "../logic/plan";

describe("Bulk Image Resizer sizing", () => {
  it("contain fits the whole image and pads, never distorting", () => {
    const plan = planResize(
      4000,
      3000,
      {kind: "box", width: 1080, height: 1080},
      "contain"
    );
    expect(plan).toMatchObject({
      width: 1080,
      height: 1080,
      to: [0, 135, 1080, 810],
      padded: true,
      cropped: false,
      stretched: false
    });
    expect(plan.to[2] / plan.to[3]).toBeCloseTo(4000 / 3000, 2);
  });

  it("cover fills the size and crops evenly", () => {
    const plan = planResize(
      4000,
      3000,
      {kind: "box", width: 1080, height: 1080},
      "cover"
    );
    expect(plan).toMatchObject({
      width: 1080,
      height: 1080,
      from: [500, 0, 3000, 3000],
      to: [0, 0, 1080, 1080],
      cropped: true
    });
  });

  it("cover with the same shape crops nothing", () => {
    expect(
      planResize(2000, 1000, {kind: "box", width: 1000, height: 500}, "cover")
        .cropped
    ).toBe(false);
  });

  it("stretch fills the size and says when it distorts", () => {
    expect(
      planResize(4000, 3000, {kind: "box", width: 500, height: 500}, "stretch")
    ).toMatchObject({stretched: true, to: [0, 0, 500, 500]});
    expect(
      planResize(4000, 3000, {kind: "box", width: 400, height: 300}, "stretch")
        .stretched
    ).toBe(false);
  });

  it("keeps the shape with one side or a percentage", () => {
    expect(
      planResize(
        4000,
        3000,
        {kind: "box", width: 1000, height: null},
        "contain"
      )
    ).toMatchObject({width: 1000, height: 750});
    expect(
      planResize(4000, 3000, {kind: "box", width: null, height: 300}, "cover")
    ).toMatchObject({width: 400, height: 300});
    expect(
      planResize(4000, 3000, {kind: "percent", percent: 25}, "stretch")
    ).toMatchObject({width: 1000, height: 750, enlarged: false});
  });

  it("notices when images get bigger", () => {
    expect(
      planResize(100, 100, {kind: "box", width: 300, height: 300}, "contain")
        .enlarged
    ).toBe(true);
    expect(
      planResize(100, 100, {kind: "percent", percent: 200}, "contain").enlarged
    ).toBe(true);
  });
});
