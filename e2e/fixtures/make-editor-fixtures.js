/* Recreates the Image Editor's photo-details test files in this folder:
   small pictures drawn in a real browser, with hand-built EXIF (camera,
   date, settings, a location and a thumbnail) put in byte by byte.
   Run: node e2e/fixtures/make-editor-fixtures.js */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const {chromium} = require("@playwright/test");

const dir = __dirname;
const W = 64;
const H = 48;

/* ---------- Building a big-endian TIFF block ---------- */

const ascii = s => ({type: 2, data: Buffer.from(s + "\0", "latin1")});
const short = (...v) => ({
  type: 3,
  data: Buffer.concat(v.map(n => Buffer.from([n >> 8, n & 0xff])))
});
const long = (...v) => ({
  type: 4,
  data: Buffer.concat(
    v.map(n => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(n);
      return b;
    })
  )
});
const rational = (...pairs) => ({
  type: 5,
  data: Buffer.concat(
    pairs.map(([n, d]) => {
      const b = Buffer.alloc(8);
      b.writeUInt32BE(n);
      b.writeUInt32BE(d, 4);
      return b;
    })
  )
});
const byte = (...v) => ({type: 1, data: Buffer.from(v)});
const SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8};

/* ifds: [{id, entries: [[tag, value | {ifd: id} | {blob: id}]], next}];
   blobs: {id: Buffer}. Directories come first, then values, then blobs. */
function tiff(ifds, blobs = {}) {
  const at = {};
  let off = 8;
  for (const ifd of ifds) {
    at[ifd.id] = off;
    off += 2 + ifd.entries.length * 12 + 4;
  }
  const values = [];
  for (const ifd of ifds) {
    for (const [, v] of ifd.entries) {
      if (v.data && v.data.length > 4) {
        v.offset = off;
        values.push(v.data);
        off += v.data.length + (v.data.length & 1);
      }
    }
  }
  for (const [id, data] of Object.entries(blobs)) {
    at[id] = off;
    values.push(data);
    off += data.length + (data.length & 1);
  }
  const out = Buffer.alloc(off);
  out.write("MM", 0, "latin1");
  out.writeUInt16BE(42, 2);
  out.writeUInt32BE(8, 4);
  for (const ifd of ifds) {
    let p = at[ifd.id];
    out.writeUInt16BE(ifd.entries.length, p);
    p += 2;
    for (const [tag, v] of [...ifd.entries].sort((a, b) => a[0] - b[0])) {
      out.writeUInt16BE(tag, p);
      if (v.ifd || v.blob) {
        out.writeUInt16BE(4, p + 2);
        out.writeUInt32BE(1, p + 4);
        out.writeUInt32BE(at[v.ifd || v.blob], p + 8);
      } else {
        out.writeUInt16BE(v.type, p + 2);
        out.writeUInt32BE(v.data.length / SIZES[v.type], p + 4);
        if (v.data.length <= 4) v.data.copy(out, p + 8);
        else out.writeUInt32BE(v.offset, p + 8);
      }
      p += 12;
    }
    out.writeUInt32BE(ifd.next ? at[ifd.next] : 0, p);
  }
  let p = values.length
    ? off - values.reduce((n, d) => n + d.length + (d.length & 1), 0)
    : off;
  for (const data of values) {
    data.copy(out, p);
    p += data.length + (data.length & 1);
  }
  return out;
}

const thumbnail = Buffer.from("THUMBNAIL-OF-THE-UNEDITED-PHOTO!", "latin1");

const photoTiff = tiff(
  [
    {
      id: "ifd0",
      next: "ifd1",
      entries: [
        [0x010f, ascii("Testcam")],
        [0x0110, ascii("T-1000")],
        [0x0112, short(6)],
        [0x0131, ascii("")],
        [0x0132, ascii("2024:05:06 10:00:00")],
        [0x8769, {ifd: "exif"}],
        [0x8825, {ifd: "gps"}]
      ]
    },
    {
      id: "exif",
      entries: [
        [0x829a, rational([1, 250])],
        [0x829d, rational([28, 10])],
        [0x8827, short(200)],
        [0x9003, ascii("2024:05:06 07:08:09")],
        [0x920a, rational([43, 10])],
        [0xa002, long(W)],
        [0xa003, long(H)],
        [0xa434, ascii("Test lens 4.3mm")]
      ]
    },
    {
      id: "gps",
      entries: [
        [1, ascii("N")],
        [2, rational([51, 1], [30, 1], [265, 10])],
        [3, ascii("W")],
        [4, rational([0, 1], [7, 1], [399, 10])],
        [5, byte(0)],
        [6, rational([35, 1])]
      ]
    },
    {
      id: "ifd1",
      entries: [
        [0x0103, short(6)],
        [0x0201, {blob: "thumb"}],
        [0x0202, long(thumbnail.length)]
      ]
    }
  ],
  {thumb: thumbnail}
);

/* ---------- Putting the block into each file type ---------- */

function jpegWith(jpeg, block) {
  const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), block]);
  const head = Buffer.from([
    0xff,
    0xe1,
    (body.length + 2) >> 8,
    (body.length + 2) & 0xff
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), head, body, jpeg.subarray(2)]);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(typed) : crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngWith(png, block) {
  const afterHeader = 8 + 25; // signature + IHDR
  return Buffer.concat([
    png.subarray(0, afterHeader),
    pngChunk("eXIf", block),
    png.subarray(afterHeader)
  ]);
}

function webpChunk(type, data) {
  const head = Buffer.alloc(8);
  head.write(type, 0, "latin1");
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(data.length & 1)]);
}

function webpWith(webp, block) {
  let chunks = webp.subarray(12);
  if (chunks.toString("latin1", 0, 4) === "VP8X") {
    // Already extended (the browser adds a colour profile): mark the EXIF.
    chunks = Buffer.from(chunks);
    chunks[8] |= 0x08;
  } else {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x08; // has EXIF
    vp8x.writeUIntLE(W - 1, 4, 3);
    vp8x.writeUIntLE(H - 1, 7, 3);
    chunks = Buffer.concat([webpChunk("VP8X", vp8x), chunks]);
  }
  const body = Buffer.concat([
    Buffer.from("WEBP", "latin1"),
    chunks,
    webpChunk("EXIF", block)
  ]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const encode = type =>
    page
      .evaluate(
        async ({type, W, H}) => {
          const canvas = new OffscreenCanvas(W, H);
          const ctx = canvas.getContext("2d");
          const colours = ["#e11d48", "#16a34a", "#2563eb", "#f59e0b"];
          colours.forEach((c, i) => {
            ctx.fillStyle = c;
            ctx.fillRect(
              (i % 2) * (W / 2),
              Math.floor(i / 2) * (H / 2),
              W / 2,
              H / 2
            );
          });
          const blob = await canvas.convertToBlob({type, quality: 0.92});
          return Array.from(new Uint8Array(await blob.arrayBuffer()));
        },
        {type, W, H}
      )
      .then(bytes => Buffer.from(bytes));

  const jpeg = await encode("image/jpeg");
  const png = await encode("image/png");
  const webp = await encode("image/webp");
  await browser.close();

  fs.writeFileSync(path.join(dir, "editor-gps.jpg"), jpegWith(jpeg, photoTiff));
  fs.writeFileSync(path.join(dir, "editor-gps.png"), pngWith(png, photoTiff));
  fs.writeFileSync(
    path.join(dir, "editor-gps.webp"),
    webpWith(webp, photoTiff)
  );

  // A directory that claims 30 entries in a block with room for two.
  const damaged = Buffer.from(photoTiff.subarray(0, 40));
  damaged.writeUInt16BE(30, 8);
  fs.writeFileSync(
    path.join(dir, "editor-damaged-exif.jpg"),
    jpegWith(jpeg, damaged)
  );
  console.log("Wrote editor-gps.jpg/.png/.webp and editor-damaged-exif.jpg");
})();
