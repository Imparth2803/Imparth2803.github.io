/* Reads an image's type, size and photo orientation from its first bytes,
   without decoding it. Used to check files before work starts (type, size,
   megapixels) and to plan memory use. */

export type ImageType = "jpeg" | "png" | "webp";

export const IMAGE_TYPES: Record<
  ImageType,
  {mime: string; ext: string; label: string}
> = {
  jpeg: {mime: "image/jpeg", ext: "jpg", label: "JPG"},
  png: {mime: "image/png", ext: "png", label: "PNG"},
  webp: {mime: "image/webp", ext: "webp", label: "WebP"}
};

/** Types the browser can open but that are not offered for saving. */
export type InputType = ImageType | "gif" | "bmp" | "avif";

export const INPUT_TYPES: Record<InputType, {label: string; exts: string[]}> = {
  jpeg: {label: "JPG", exts: ["jpg", "jpeg"]},
  png: {label: "PNG", exts: ["png"]},
  webp: {label: "WebP", exts: ["webp"]},
  gif: {label: "GIF", exts: ["gif"]},
  bmp: {label: "BMP", exts: ["bmp"]},
  avif: {label: "AVIF", exts: ["avif"]}
};

export const isImageType = (type: InputType): type is ImageType =>
  type in IMAGE_TYPES;

export interface InputHeader {
  type: InputType;
  /** Size as the photo is meant to be seen (after its rotation is applied). */
  width: number;
  height: number;
  /** EXIF orientation (1 = upright). */
  orientation: number;
}

export interface ImageHeader extends InputHeader {
  type: ImageType;
  /** Size as the photo is meant to be seen (after its rotation is applied). */
  width: number;
  height: number;
  /** EXIF orientation (1 = upright). */
  orientation: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;

/** JPG, PNG and WebP only: the types the image tools can also save. */
export function readImageHeader(b: Uint8Array): ImageHeader | null {
  const header = readInputHeader(b);
  return header && isImageType(header.type) ? (header as ImageHeader) : null;
}

export function readInputHeader(b: Uint8Array): InputHeader | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpeg(b);
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b.length >= 24
  ) {
    return {
      type: "png",
      width: u32be(b, 16),
      height: u32be(b, 20),
      orientation: 1
    };
  }
  const ascii = (i: number, n: number) =>
    String.fromCharCode(...Array.from(b.subarray(i, i + n)));
  if (b.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
    return webp(b, ascii(12, 4));
  if (b.length >= 10 && /^GIF8[79]a$/.test(ascii(0, 6))) {
    return {
      type: "gif",
      width: u16le(b, 6),
      height: u16le(b, 8),
      orientation: 1
    };
  }
  if (b.length >= 26 && ascii(0, 2) === "BM") {
    const i32 = (i: number) =>
      b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24);
    return {
      type: "bmp",
      width: Math.abs(i32(18)),
      height: Math.abs(i32(22)), // negative means stored top-down
      orientation: 1
    };
  }
  if (b.length >= 12 && ascii(4, 4) === "ftyp" && /^avi[fs]$/.test(ascii(8, 4)))
    return avif(b);
  return null;
}

/* AVIF keeps its size in "ispe" boxes (one per picture, including any
   small preview); the largest is the image itself. */
function avif(b: Uint8Array): InputHeader | null {
  let width = 0;
  let height = 0;
  for (let i = 0; i + 16 <= b.length; i++) {
    if (
      b[i] === 0x69 &&
      b[i + 1] === 0x73 &&
      b[i + 2] === 0x70 &&
      b[i + 3] === 0x65
    ) {
      const w = u32be(b, i + 8);
      const h = u32be(b, i + 12);
      if (w * h > width * height) {
        width = w;
        height = h;
      }
    }
  }
  return width && height ? {type: "avif", width, height, orientation: 1} : null;
}

function webp(b: Uint8Array, chunk: string): InputHeader | null {
  let width: number;
  let height: number;
  if (chunk === "VP8 ") {
    width = u16le(b, 26) & 0x3fff;
    height = u16le(b, 28) & 0x3fff;
  } else if (chunk === "VP8L") {
    const [b0, b1, b2, b3] = [b[21]!, b[22]!, b[23]!, b[24]!];
    width = 1 + (((b1 & 0x3f) << 8) | b0);
    height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
  } else if (chunk === "VP8X") {
    width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
  } else {
    return null;
  }
  return {type: "webp", width, height, orientation: 1};
}

function jpeg(b: Uint8Array): InputHeader | null {
  let orientation = 1;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++; // padding
      continue;
    }
    const length = u16be(b, i + 2);
    if (marker === 0xe1)
      orientation = exifOrientation(b, i + 4, length - 2) ?? orientation;
    // Start-of-frame markers hold the size (not DHT C4, JPG C8, DAC CC).
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = u16be(b, i + 5);
      const width = u16be(b, i + 7);
      const turned = orientation >= 5 && orientation <= 8;
      return {
        type: "jpeg",
        width: turned ? height : width,
        height: turned ? width : height,
        orientation
      };
    }
    i += 2 + length;
  }
  return null;
}

/* The Orientation tag (0x0112) from an EXIF block, if there is one. */
function exifOrientation(
  b: Uint8Array,
  start: number,
  length: number
): number | null {
  const ascii = String.fromCharCode(
    ...Array.from(b.subarray(start, start + 6))
  );
  if (ascii !== "Exif\0\0") return null;
  const tiff = start + 6;
  const little = b[tiff] === 0x49; // "II"
  const read16 = (i: number) => (little ? u16le(b, i) : u16be(b, i));
  const read32 = (i: number) =>
    little
      ? read16(i) + read16(i + 2) * 65536
      : read16(i) * 65536 + read16(i + 2);
  const ifd = tiff + read32(tiff + 4);
  if (ifd + 2 > start + length) return null;
  const entries = read16(ifd);
  for (let e = 0; e < entries; e++) {
    const entry = ifd + 2 + e * 12;
    if (entry + 12 > start + length) return null;
    if (read16(entry) === 0x0112) {
      const value = read16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/* Reads enough of a file to find its header (JPEG headers can sit after a
   large embedded thumbnail). */
async function readHeaderOf<H>(
  file: Blob,
  read: (b: Uint8Array) => H | null
): Promise<H | null> {
  const first = await file.slice(0, 256 * 1024).arrayBuffer();
  const header = read(new Uint8Array(first));
  if (header || file.size <= 256 * 1024) return header;
  return read(new Uint8Array(await file.arrayBuffer()));
}

export const readFileHeader = (file: Blob) =>
  readHeaderOf(file, readImageHeader);

export const readFileInputHeader = (file: Blob) =>
  readHeaderOf(file, readInputHeader);
