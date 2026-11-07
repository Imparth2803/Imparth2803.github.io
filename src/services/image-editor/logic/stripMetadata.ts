/* Removes photo details from a file's bytes without re-saving the picture,
   so its quality is exactly the same. Works on JPEG, PNG and WebP. */

import {crc32} from "./crc32";
import {
  Container,
  findBlocks,
  Range,
  readMetadata,
  readTiff,
  Tiff
} from "./exif";

export type StripResult =
  | {ok: true; bytes: Uint8Array; keptOrientation: boolean}
  | {ok: false; problem: string};

function write16(b: Uint8Array, at: number, v: number, little: boolean) {
  b[at] = little ? v & 0xff : (v >> 8) & 0xff;
  b[at + 1] = little ? (v >> 8) & 0xff : v & 0xff;
}

function write32(b: Uint8Array, at: number, v: number, little: boolean) {
  for (let i = 0; i < 4; i++) {
    const shift = little ? i * 8 : (3 - i) * 8;
    b[at + i] = (v >>> shift) & 0xff;
  }
}

/** Blanks one directory: its entries, their values, and its count. */
function blankIfd(b: Uint8Array, ifd: Tiff["gps"], keepNext = true) {
  if (!ifd) return;
  for (const e of ifd.entries) {
    if (!e.inline) b.fill(0, e.valueAt, e.valueAt + e.valueLength);
  }
  // The count, every entry and (unless kept) the next-directory offset.
  b.fill(0, ifd.at, keepNext ? ifd.nextAt : ifd.nextAt + 4);
}

/** Blanks the location directory in place. The length never changes, so
    no other offsets move. */
function blankGps(b: Uint8Array, tiff: Tiff) {
  blankIfd(b, tiff.gps, false);
}

/** Copies the file without some ranges, and with an optional insert. */
function rebuild(
  b: Uint8Array,
  drop: Range[],
  insert: {at: number; data: Uint8Array} | null
) {
  const parts: Uint8Array[] = [];
  let at = 0;
  const cuts = [...drop].sort((x, y) => x.start - y.start);
  for (const cut of cuts) {
    if (insert && insert.at >= at && insert.at <= cut.start) {
      parts.push(b.subarray(at, insert.at), insert.data);
      at = insert.at;
      insert = null;
    }
    parts.push(b.subarray(at, cut.start));
    at = Math.max(at, cut.start + cut.length);
  }
  if (insert) {
    parts.push(b.subarray(at, insert.at), insert.data);
    at = insert.at;
  }
  parts.push(b.subarray(at));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** After changing a WebP's chunks: fix the file size and the flags that
    say whether EXIF and XMP are there. */
function fixWebp(b: Uint8Array) {
  write32(b, 4, b.length - 8, true);
  const blocks = findBlocks(b);
  if (blocks.vp8xFlags !== null) {
    let flags = b[blocks.vp8xFlags]! & ~0x0c;
    if (blocks.tiff) flags |= 0x08;
    if (blocks.xmp.length) flags |= 0x04;
    b[blocks.vp8xFlags] = flags;
  }
  return b;
}

/** A tiny EXIF block holding only the turn setting (Orientation). */
function orientationTiff(orientation: number) {
  return Uint8Array.from([
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
  ]);
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0];

/** TIFF data wrapped as a JPEG segment, PNG chunk or WebP chunk. */
function wrap(container: Container, tiff: Uint8Array) {
  if (container === "jpeg") {
    const n = tiff.length + 8;
    return Uint8Array.from([
      0xff,
      0xe1,
      n >> 8,
      n & 0xff,
      ...EXIF_HEADER,
      ...tiff
    ]);
  }
  if (container === "png") {
    const out = new Uint8Array(tiff.length + 12);
    write32(out, 0, tiff.length, false);
    out.set([0x65, 0x58, 0x49, 0x66], 4); // "eXIf"
    out.set(tiff, 8);
    write32(out, 8 + tiff.length, crc32(out, 4, 8 + tiff.length), false);
    return out;
  }
  const pad = tiff.length & 1;
  const out = new Uint8Array(8 + tiff.length + pad);
  out.set([0x45, 0x58, 0x49, 0x46], 0); // "EXIF"
  write32(out, 4, tiff.length, true);
  out.set(tiff, 8);
  return out;
}

const DAMAGED =
  "The photo details in this file are damaged, so only “Remove all” can be used safely.";

/** Removes the location (and XMP, which can hold it too); keeps the rest. */
export function removeLocation(bytes: Uint8Array): StripResult {
  const meta = readMetadata(bytes);
  if (meta.status === "damaged") return {ok: false, problem: DAMAGED};
  const {ranges} = meta;
  const out = bytes.slice();
  if (ranges.tiff) {
    const tiff = readTiff(out, ranges.tiff);
    blankGps(out, tiff);
    if (ranges.container === "png" && ranges.exifBlock) {
      const {start, length} = ranges.exifBlock;
      const end = start + length - 4;
      write32(out, end, crc32(out, start + 4, end), false);
    }
  }
  if (ranges.xmp.length === 0)
    return {ok: true, bytes: out, keptOrientation: false};
  const rebuilt = rebuild(out, ranges.xmp, null);
  return {
    ok: true,
    bytes: ranges.container === "webp" ? fixWebp(rebuilt) : rebuilt,
    keptOrientation: false
  };
}

/** Removes all photo details. A photo stored sideways keeps just its turn
    setting, so it still shows upright. */
export function removeAll(bytes: Uint8Array): StripResult {
  const meta = readMetadata(bytes);
  const {ranges} = meta;
  if (!ranges.container)
    return {ok: false, problem: "This file type isn't supported."};
  const drop = [...ranges.xmp];
  if (ranges.exifBlock) drop.push(ranges.exifBlock);
  const o = meta.orientation;
  const keep = !!ranges.exifBlock && o !== null && o >= 2 && o <= 8;
  const insert = keep
    ? {
        at: ranges.exifBlock!.start,
        data: wrap(ranges.container, orientationTiff(o!))
      }
    : null;
  const rebuilt = rebuild(bytes, drop, insert);
  return {
    ok: true,
    bytes: ranges.container === "webp" ? fixWebp(rebuilt) : rebuilt,
    keptOrientation: keep
  };
}

export type CameraDetails =
  | {ok: true; segment: Uint8Array}
  | {ok: false; reason: "none" | "damaged" | "too-big"};

/** The original's camera details made ready for an edited JPG: without
    location, with the turn setting reset (the pixels are already upright),
    the new size, and no thumbnail (which would show the unedited photo). */
export function cameraDetailsFor(
  original: Uint8Array,
  width: number,
  height: number
): CameraDetails {
  const meta = readMetadata(original);
  if (meta.status === "damaged") return {ok: false, reason: "damaged"};
  const range = meta.ranges.tiff;
  if (!range) return {ok: false, reason: "none"};
  if (range.length + 8 > 65535) return {ok: false, reason: "too-big"};
  const copy = original.slice(range.start, range.start + range.length);
  let tiff: Tiff;
  try {
    tiff = readTiff(copy, {start: 0, length: copy.length});
  } catch {
    return {ok: false, reason: "damaged"};
  }
  const {little} = tiff;
  blankGps(copy, tiff);
  const set = (ifd: Tiff["ifd0"], tag: number, value: number) => {
    const e = ifd?.entries.find(x => x.tag === tag && x.count === 1);
    if (e?.type === 3) write16(copy, e.valueAt, value, little);
    else if (e?.type === 4) write32(copy, e.valueAt, value, little);
  };
  set(tiff.ifd0, 0x0112, 1);
  set(tiff.exif, 0xa002, width);
  set(tiff.exif, 0xa003, height);
  if (tiff.ifd1) {
    // Blank the thumbnail's own bytes, then its directory.
    const thumbAt = tiff.ifd1.entries.find(e => e.tag === 0x0201);
    const thumbLength = tiff.ifd1.entries.find(e => e.tag === 0x0202);
    if (thumbAt && thumbLength) {
      const view = new DataView(copy.buffer, copy.byteOffset);
      const read = (at: number) => view.getUint32(at, little);
      const start = read(thumbAt.valueAt);
      const end = Math.min(copy.length, start + read(thumbLength.valueAt));
      if (start >= 8 && start < end) copy.fill(0, start, end);
    }
    blankIfd(copy, tiff.ifd1, false);
  }
  if (tiff.ifd0) write32(copy, tiff.ifd0.nextAt, 0, little);
  return {ok: true, segment: wrap("jpeg", copy)};
}

/** Puts an APP1 segment into a JPEG straight after its start (and after
    the APP0 header, when there is one). */
export function insertIntoJpeg(jpeg: Uint8Array, segment: Uint8Array) {
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0 && jpeg.length > 6) {
    at = 4 + ((jpeg[4]! << 8) | jpeg[5]!);
  }
  return rebuild(jpeg, [], {at, data: segment});
}
