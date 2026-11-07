/* Reads photo details (EXIF: camera, date, settings, location) from the
   bytes of a JPEG, PNG or WebP file. Everything is read here, in the
   browser; nothing is sent anywhere. Every read is checked against the
   file's length, so a damaged or hostile file can't make it crash or loop. */

export type Container = "jpeg" | "png" | "webp";

export interface Range {
  start: number;
  length: number;
}

/** Where things are in the file, for removing them later. */
export interface MetaRanges {
  container: Container | null;
  /** The TIFF data (from "II"/"MM"), inside the segment or chunk below. */
  tiff: Range | null;
  /** The whole JPEG segment, PNG chunk or WebP chunk holding the EXIF. */
  exifBlock: Range | null;
  /** Whole segments or chunks holding XMP (which can include location). */
  xmp: Range[];
  /** Offset of the WebP VP8X flags byte. */
  vp8xFlags: number | null;
}

export interface MetaField {
  label: string;
  /** "" means the field is there but blank. */
  value: string;
}

export interface Gps {
  lat: number;
  lon: number;
  alt?: number;
}

export interface Metadata {
  status: "none" | "found" | "damaged";
  hasXmp: boolean;
  fields: MetaField[];
  gps: Gps | null;
  orientation: number | null;
  ranges: MetaRanges;
}

/* ---------- Reading bytes safely ---------- */

class Damaged extends Error {}

class Reader {
  constructor(readonly b: Uint8Array, readonly little = false) {}
  check(at: number, n: number) {
    if (!(at >= 0 && n >= 0 && at + n <= this.b.length)) throw new Damaged();
  }
  u8(at: number) {
    this.check(at, 1);
    return this.b[at]!;
  }
  u16(at: number) {
    this.check(at, 2);
    const [x, y] = [this.b[at]!, this.b[at + 1]!];
    return this.little ? x | (y << 8) : (x << 8) | y;
  }
  u32(at: number) {
    this.check(at, 4);
    const [a, b, c, d] = [
      this.b[at]!,
      this.b[at + 1]!,
      this.b[at + 2]!,
      this.b[at + 3]!
    ];
    return (
      (this.little
        ? (d << 24) | (c << 16) | (b << 8) | a
        : (a << 24) | (b << 16) | (c << 8) | d) >>> 0
    );
  }
  i32(at: number) {
    return this.u32(at) | 0;
  }
  ascii(at: number, n: number) {
    this.check(at, n);
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.b[at + i]!);
    return s;
  }
}

const startsWith = (b: Uint8Array, at: number, text: string) => {
  if (at < 0 || at + text.length > b.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (b[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

/* ---------- Finding the blocks in each file type ---------- */

const EXIF_HEADER = "Exif\0\0";
const XMP_JPEG = "http://ns.adobe.com/xap/1.0/\0";
const XMP_JPEG_EXTENDED = "http://ns.adobe.com/xmp/extension/\0";
const XMP_PNG = "XML:com.adobe.xmp\0";

export function findBlocks(b: Uint8Array): MetaRanges {
  const out: MetaRanges = {
    container: null,
    tiff: null,
    exifBlock: null,
    xmp: [],
    vp8xFlags: null
  };
  const r = new Reader(b);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8) {
    out.container = "jpeg";
    let at = 2;
    try {
      while (at + 4 <= b.length) {
        if (r.u8(at) !== 0xff) break;
        const marker = r.u8(at + 1);
        if (marker === 0xff) {
          at++; // fill byte
          continue;
        }
        if (
          marker === 0xd8 ||
          marker === 0x01 ||
          (marker >= 0xd0 && marker <= 0xd7)
        ) {
          at += 2;
          continue;
        }
        if (marker === 0xd9 || marker === 0xda) break; // end, or the picture data
        const length = r.u16(at + 2);
        if (length < 2) break;
        const segment = {start: at, length: length + 2};
        if (at + segment.length > b.length) break;
        if (marker === 0xe1) {
          if (startsWith(b, at + 4, EXIF_HEADER) && !out.tiff) {
            out.exifBlock = segment;
            out.tiff = {start: at + 10, length: length - 8};
          } else if (
            startsWith(b, at + 4, XMP_JPEG) ||
            startsWith(b, at + 4, XMP_JPEG_EXTENDED)
          ) {
            out.xmp.push(segment);
          }
        }
        at += segment.length;
      }
    } catch {
      // A damaged marker list: keep what was found.
    }
  } else if (startsWith(b, 0, "\x89PNG\r\n\x1a\n")) {
    out.container = "png";
    let at = 8;
    try {
      while (at + 12 <= b.length) {
        const length = r.u32(at);
        const type = r.ascii(at + 4, 4);
        const chunk = {start: at, length: length + 12};
        if (at + chunk.length > b.length) break;
        if (type === "eXIf" && !out.tiff) {
          out.exifBlock = chunk;
          out.tiff = {start: at + 8, length};
        } else if (
          (type === "iTXt" || type === "tEXt" || type === "zTXt") &&
          startsWith(b, at + 8, XMP_PNG)
        ) {
          out.xmp.push(chunk);
        }
        if (type === "IEND") break;
        at += chunk.length;
      }
    } catch {
      // Keep what was found.
    }
  } else if (startsWith(b, 0, "RIFF") && startsWith(b, 8, "WEBP")) {
    out.container = "webp";
    const lr = new Reader(b, true);
    let at = 12;
    try {
      while (at + 8 <= b.length) {
        const type = lr.ascii(at, 4);
        const size = lr.u32(at + 4);
        const chunk = {start: at, length: 8 + size + (size & 1)};
        if (at + 8 + size > b.length) break;
        if (type === "VP8X") out.vp8xFlags = at + 8;
        else if (type === "EXIF" && !out.tiff) {
          out.exifBlock = {
            ...chunk,
            length: Math.min(chunk.length, b.length - at)
          };
          // Some programs put "Exif\0\0" in front of the TIFF data.
          const skip = startsWith(b, at + 8, EXIF_HEADER) ? 6 : 0;
          out.tiff = {start: at + 8 + skip, length: size - skip};
        } else if (type === "XMP ") {
          out.xmp.push({
            ...chunk,
            length: Math.min(chunk.length, b.length - at)
          });
        }
        at += chunk.length;
      }
    } catch {
      // Keep what was found.
    }
  }
  return out;
}

/* ---------- The TIFF structure inside the EXIF block ---------- */

export interface Entry {
  tag: number;
  type: number;
  count: number;
  /** Where the 12-byte entry starts (in the file). */
  at: number;
  /** Where its value is (in the file): in the entry, or elsewhere. */
  valueAt: number;
  valueLength: number;
  inline: boolean;
}

export interface Ifd {
  /** Where the IFD starts (its entry count), in the file. */
  at: number;
  entries: Entry[];
  /** Where the offset of the next IFD is, in the file. */
  nextAt: number;
}

export interface Tiff {
  little: boolean;
  start: number;
  length: number;
  ifd0: Ifd | null;
  exif: Ifd | null;
  gps: Ifd | null;
  ifd1: Ifd | null;
}

const TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8
};
const MAX_ENTRIES = 500;

/** Reads the TIFF header and IFDs. Throws Damaged on bad data. */
export function readTiff(b: Uint8Array, range: Range): Tiff {
  const {start, length} = range;
  const end = start + length;
  if (length < 8 || end > b.length) throw new Damaged();
  const order = String.fromCharCode(b[start]!, b[start + 1]!);
  if (order !== "II" && order !== "MM") throw new Damaged();
  const r = new Reader(b, order === "II");
  if (r.u16(start + 2) !== 42) throw new Damaged();
  const visited = new Set<number>();

  const ifdAt = (offset: number): Ifd | null => {
    if (offset === 0) return null;
    const at = start + offset;
    if (offset < 8 || at + 2 > end || visited.has(at)) throw new Damaged();
    visited.add(at);
    const count = r.u16(at);
    if (count > MAX_ENTRIES || at + 2 + count * 12 + 4 > end)
      throw new Damaged();
    const entries: Entry[] = [];
    for (let i = 0; i < count; i++) {
      const e = at + 2 + i * 12;
      const tag = r.u16(e);
      const type = r.u16(e + 2);
      const n = r.u32(e + 4);
      const size = TYPE_SIZE[type] ?? 0;
      const valueLength = size * n;
      const inline = valueLength <= 4;
      const valueAt = inline ? e + 8 : start + r.u32(e + 8);
      // Values outside the block are skipped rather than trusted.
      if (!inline && (valueAt < start || valueAt + valueLength > end)) continue;
      entries.push({tag, type, count: n, at: e, valueAt, valueLength, inline});
    }
    return {at, entries, nextAt: at + 2 + count * 12};
  };

  const ifd0 = ifdAt(r.u32(start + 4));
  const pointer = (ifd: Ifd | null, tag: number) => {
    const e = ifd?.entries.find(x => x.tag === tag);
    return e && (e.type === 4 || e.type === 13) ? r.u32(e.valueAt) : 0;
  };
  const exif = ifd0 ? ifdAt(pointer(ifd0, 0x8769)) : null;
  const gps = ifd0 ? ifdAt(pointer(ifd0, 0x8825)) : null;
  let ifd1: Ifd | null = null;
  if (ifd0) {
    try {
      ifd1 = ifdAt(r.u32(ifd0.nextAt));
    } catch {
      ifd1 = null; // A damaged thumbnail directory doesn't matter here.
    }
  }
  return {little: r.little, start, length, ifd0, exif, gps, ifd1};
}

/* ---------- Turning values into text ---------- */

function values(b: Uint8Array, little: boolean, e: Entry): number[] {
  const r = new Reader(b, little);
  const out: number[] = [];
  const n = Math.min(e.count, 64);
  for (let i = 0; i < n; i++) {
    const at = e.valueAt + i * (TYPE_SIZE[e.type] ?? 1);
    switch (e.type) {
      case 1:
      case 7:
        out.push(r.u8(at));
        break;
      case 3:
        out.push(r.u16(at));
        break;
      case 4:
        out.push(r.u32(at));
        break;
      case 9:
        out.push(r.i32(at));
        break;
      case 5: {
        const d = r.u32(at + 4);
        out.push(d === 0 ? NaN : r.u32(at) / d);
        break;
      }
      case 10: {
        const d = r.i32(at + 4);
        out.push(d === 0 ? NaN : r.i32(at) / d);
        break;
      }
      default:
        return out;
    }
  }
  return out;
}

function text(b: Uint8Array, e: Entry): string {
  const r = new Reader(b);
  let s = r.ascii(e.valueAt, Math.min(e.valueLength, 256));
  const end = s.indexOf("\0");
  if (end >= 0) s = s.slice(0, end);
  // Keep printable characters only.
  return s.replace(/[^\x20-\x7e -ÿ]/g, "").trim();
}

const ORIENTATIONS: Record<number, string> = {
  1: "Upright",
  2: "Mirrored",
  3: "Upside down",
  4: "Upside down, mirrored",
  5: "Turned and mirrored",
  6: "Turned a quarter right",
  7: "Turned and mirrored",
  8: "Turned a quarter left"
};

const round = (n: number, places: number) =>
  Number.isFinite(n) ? String(Number(n.toFixed(places))) : "";

function exposure(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return seconds >= 1
    ? `${round(seconds, 1)} s`
    : `1/${Math.round(1 / seconds)} s`;
}

function exifDate(s: string) {
  // "2024:05:06 07:08:09" → "2024-05-06 07:08:09"
  const m = /^(\d{4}):(\d{2}):(\d{2})(.*)$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}${m[4]}` : s;
}

/** Reads the photo details from a file's bytes. Never throws. */
export function readMetadata(b: Uint8Array): Metadata {
  const ranges = findBlocks(b);
  const result: Metadata = {
    status: "none",
    hasXmp: ranges.xmp.length > 0,
    fields: [],
    gps: null,
    orientation: null,
    ranges
  };
  if (result.hasXmp) result.status = "found";
  if (!ranges.tiff) return result;
  result.status = "found";
  let tiff: Tiff;
  try {
    tiff = readTiff(b, ranges.tiff);
  } catch {
    result.status = "damaged";
    return result;
  }
  const add = (label: string, value: string | null | undefined) => {
    if (value !== null && value !== undefined)
      result.fields.push({label, value});
  };
  try {
    const find = (ifd: Ifd | null, tag: number) =>
      ifd?.entries.find(e => e.tag === tag);
    const str = (ifd: Ifd | null, tag: number) => {
      const e = find(ifd, tag);
      return e
        ? e.type === 2 || e.type === 7
          ? text(b, e)
          : values(b, tiff.little, e).join(" ")
        : null;
    };
    const num = (ifd: Ifd | null, tag: number) => {
      const e = find(ifd, tag);
      return e ? values(b, tiff.little, e)[0] ?? NaN : null;
    };
    const {ifd0, exif, gps} = tiff;

    add("Camera make", str(ifd0, 0x010f));
    add("Camera model", str(ifd0, 0x0110));
    add("Lens", str(exif, 0xa434));
    const taken = str(exif, 0x9003);
    add("Date taken", taken === null ? null : exifDate(taken));
    const changed = str(ifd0, 0x0132);
    add("Date changed", changed === null ? null : exifDate(changed));
    add("Software", str(ifd0, 0x0131));
    const o = num(ifd0, 0x0112);
    if (o !== null) {
      result.orientation = Number.isFinite(o) ? o : null;
      add("Orientation", ORIENTATIONS[o] ?? `Unknown (${o})`);
    }
    const pw = num(exif, 0xa002);
    const ph = num(exif, 0xa003);
    if (pw !== null && ph !== null)
      add("Size recorded", `${pw} × ${ph} pixels`);
    const t = num(exif, 0x829a);
    if (t !== null) add("Exposure time", exposure(t));
    const f = num(exif, 0x829d);
    if (f !== null)
      add("Aperture", Number.isFinite(f) ? `f/${round(f, 1)}` : "");
    const iso = num(exif, 0x8827);
    if (iso !== null) add("ISO", Number.isFinite(iso) ? String(iso) : "");
    const focal = num(exif, 0x920a);
    if (focal !== null)
      add(
        "Focal length",
        Number.isFinite(focal) ? `${round(focal, 1)} mm` : ""
      );

    if (gps) {
      const coord = (refTag: number, tag: number, negative: string) => {
        const e = find(gps, tag);
        if (!e) return null;
        const [d = NaN, m = 0, s = 0] = values(b, tiff.little, e);
        const deg = d + m / 60 + s / 3600;
        if (!Number.isFinite(deg)) return null;
        const ref = str(gps, refTag);
        return ref?.toUpperCase().startsWith(negative) ? -deg : deg;
      };
      const lat = coord(1, 2, "S");
      const lon = coord(3, 4, "W");
      if (lat !== null && lon !== null) {
        const alt = num(gps, 6);
        const below = num(gps, 5) === 1;
        result.gps = {lat, lon};
        if (alt !== null && Number.isFinite(alt))
          result.gps.alt = below ? -alt : alt;
        add("Location", `${round(lat, 6)}, ${round(lon, 6)}`);
        if (result.gps.alt !== undefined)
          add("Altitude", `${round(result.gps.alt, 1)} m`);
      } else if (gps.entries.length > 0) {
        add("Location", "");
      }
    }
  } catch {
    result.status = "damaged";
  }
  return result;
}
