import {readImageHeader, readInputHeader} from "../images/header";
import {outputName, uniqueNames} from "../images/names";
import {WorkerPool} from "../worker/WorkerPool";

/* A minimal JPEG start: SOI, optional EXIF with an orientation, then a
   start-of-frame with the size. */
function jpeg(width: number, height: number, orientation?: number): Uint8Array {
  const bytes = [0xff, 0xd8];
  if (orientation) {
    const tiff = [
      0x4d,
      0x4d,
      0,
      0x2a,
      0,
      0,
      0,
      8,
      0,
      1,
      0x01,
      0x12,
      0,
      3,
      0,
      0,
      0,
      1,
      0,
      orientation,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    bytes.push(
      0xff,
      0xe1,
      (body.length + 2) >> 8,
      (body.length + 2) & 0xff,
      ...body
    );
  }
  bytes.push(
    0xff,
    0xc0,
    0,
    17,
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    3,
    ...new Array(9).fill(0)
  );
  return new Uint8Array(bytes);
}

describe("image headers", () => {
  it("reads JPEG size and turns it for rotated photos", () => {
    expect(readImageHeader(jpeg(4000, 3000))).toEqual({
      type: "jpeg",
      width: 4000,
      height: 3000,
      orientation: 1
    });
    expect(readImageHeader(jpeg(4000, 3000, 6))).toEqual({
      type: "jpeg",
      width: 3000,
      height: 4000,
      orientation: 6
    });
    expect(readImageHeader(jpeg(4000, 3000, 3))).toEqual({
      type: "jpeg",
      width: 4000,
      height: 3000,
      orientation: 3
    });
  });

  it("reads PNG and WebP sizes", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0, 0, 0x07, 0x80, 0, 0, 0x04, 0x38], 16); // 1920 x 1080
    expect(readImageHeader(png)).toEqual({
      type: "png",
      width: 1920,
      height: 1080,
      orientation: 1
    });

    const webp = new Uint8Array(30);
    webp.set(Array.from("RIFF....WEBPVP8X", c => c.charCodeAt(0)));
    webp.set([0x7f, 0x07, 0, 0x37, 0x04, 0], 24); // 1920 x 1080 (stored minus one)
    expect(readImageHeader(webp)).toEqual({
      type: "webp",
      width: 1920,
      height: 1080,
      orientation: 1
    });
  });

  it("rejects files that aren't images", () => {
    expect(
      readImageHeader(
        new TextEncoder().encode("this is a text file renamed .png")
      )
    ).toBeNull();
  });
});

describe("other image types the editor can open", () => {
  const bytes = (...parts: (string | number[])[]) =>
    new Uint8Array(
      parts.flatMap(p =>
        typeof p === "string" ? Array.from(p, c => c.charCodeAt(0)) : p
      )
    );

  it("reads GIF, BMP and AVIF sizes", () => {
    expect(readInputHeader(bytes("GIF89a", [0x40, 0x01, 0xf0, 0x00]))).toEqual({
      type: "gif",
      width: 320,
      height: 240,
      orientation: 1
    });
    const bmp = new Uint8Array(30);
    bmp.set(bytes("BM"));
    new DataView(bmp.buffer).setInt32(18, 640, true);
    new DataView(bmp.buffer).setInt32(22, -480, true); // stored top-down
    expect(readInputHeader(bmp)).toEqual({
      type: "bmp",
      width: 640,
      height: 480,
      orientation: 1
    });
    const box = (w: number, h: number) => {
      const b = new Uint8Array(20);
      b.set(bytes([0, 0, 0, 20], "ispe"));
      new DataView(b.buffer).setUint32(12, w);
      new DataView(b.buffer).setUint32(16, h);
      return Array.from(b);
    };
    // A small preview first, then the real picture: the larger one wins.
    const avif = bytes(
      [0, 0, 0, 24],
      "ftypavif",
      box(160, 120),
      box(4000, 3000)
    );
    expect(readInputHeader(avif)).toEqual({
      type: "avif",
      width: 4000,
      height: 3000,
      orientation: 1
    });
  });

  it("isn't offered to tools that can only save JPG, PNG and WebP", () => {
    expect(readImageHeader(bytes("GIF89a", [1, 0, 1, 0]))).toBeNull();
  });
});

describe("file names", () => {
  it("changes extensions and keeps names unique in a ZIP", () => {
    expect(outputName("Holiday.photo.PNG", "jpg")).toBe("Holiday.photo.jpg");
    expect(uniqueNames(["a.jpg", "A.jpg", "a.jpg", "b.png"])).toEqual([
      "a.jpg",
      "A (2).jpg",
      "a (3).jpg",
      "b.png"
    ]);
  });
});

/* A stand-in Worker that answers each request after `delay` ms. */
class FakeWorker {
  onmessage: ((e: {data: unknown}) => void) | null = null;
  onerror: (() => void) | null = null;
  static running = 0;
  static peak = 0;
  postMessage({id, payload}: {id: number; payload: number}) {
    FakeWorker.running++;
    FakeWorker.peak = Math.max(FakeWorker.peak, FakeWorker.running);
    setTimeout(() => {
      FakeWorker.running--;
      this.onmessage?.({data: {id, ok: true, result: payload * 2}});
    }, 5);
  }
  terminate() {}
}

describe("worker pool", () => {
  it("runs jobs in parallel within the memory budget", async () => {
    FakeWorker.peak = 0;
    const pool = new WorkerPool(
      () => new FakeWorker() as unknown as Worker,
      4,
      30
    );
    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6].map(n => pool.run("double", n, 12))
    );
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
    expect(FakeWorker.peak).toBe(2); // 3 × 12 would exceed the budget of 30
  });

  it("still runs a job heavier than the whole budget, on its own", async () => {
    FakeWorker.peak = 0;
    const pool = new WorkerPool(
      () => new FakeWorker() as unknown as Worker,
      4,
      10
    );
    expect(
      await Promise.all([pool.run("double", 1, 50), pool.run("double", 2, 50)])
    ).toEqual([2, 4]);
    expect(FakeWorker.peak).toBe(1);
  });

  it("stops queued jobs when cancelled", async () => {
    const pool = new WorkerPool(
      () => new FakeWorker() as unknown as Worker,
      1,
      100
    );
    const first = pool.run("double", 1, 1);
    const second = pool.run("double", 2, 1);
    pool.cancel();
    await expect(first).rejects.toThrow("Stopped");
    await expect(second).rejects.toThrow("Stopped");
  });
});
