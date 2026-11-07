import {lossyQuality, pngColours, searchQuality} from "../logic/levels";

/* A fake encoder: file size grows with quality. */
const fakeEncode = (sizeAt: (q: number) => number) => async (q: number) =>
  new Blob([new Uint8Array(Math.round(sizeAt(q)))]);

describe("Smart Image Compressor levels", () => {
  it("maps levels to JPG/WebP quality and PNG colours", () => {
    expect([
      lossyQuality("high", 0),
      lossyQuality("balanced", 0),
      lossyQuality("small", 0),
      lossyQuality("custom", 40)
    ]).toEqual([0.85, 0.7, 0.5, 0.4]);
    expect([
      pngColours("high", 0),
      pngColours("balanced", 0),
      pngColours("small", 0)
    ]).toEqual([0, 256, 64]);
    expect([95, 75, 55, 35, 10].map(q => pngColours("custom", q))).toEqual([
      0, 256, 128, 64, 32
    ]);
  });

  it("finds the highest quality that fits the target", async () => {
    const found = await searchQuality(
      fakeEncode(q => 1000 * q),
      600
    );
    expect(found.fits).toBe(true);
    expect(found.blob.size).toBeLessThanOrEqual(600);
    expect(found.quality).toBeGreaterThan(0.58);
  });

  it("returns the smallest result and says when nothing fits", async () => {
    const found = await searchQuality(
      fakeEncode(q => 1000 + 1000 * q),
      500
    );
    expect(found).toMatchObject({fits: false, quality: 0.05});
    expect(found.blob.size).toBe(1050);
  });
});
