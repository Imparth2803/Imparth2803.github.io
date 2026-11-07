import fs from "fs";
import path from "path";
import {crc32} from "../logic/crc32";
import {readMetadata} from "../logic/exif";
import {
  cameraDetailsFor,
  insertIntoJpeg,
  removeAll,
  removeLocation
} from "../logic/stripMetadata";

const fixture = (name: string) =>
  new Uint8Array(
    fs.readFileSync(path.join(__dirname, "../../../../e2e/fixtures", name))
  );

const field = (meta: ReturnType<typeof readMetadata>, label: string) =>
  meta.fields.find(f => f.label === label)?.value;

const FILES = ["editor-gps.jpg", "editor-gps.png", "editor-gps.webp"];

describe("reading photo details", () => {
  it.each(FILES)("reads camera, date, settings and location from %s", name => {
    const meta = readMetadata(fixture(name));
    expect(meta.status).toBe("found");
    expect(field(meta, "Camera make")).toBe("Testcam");
    expect(field(meta, "Camera model")).toBe("T-1000");
    expect(field(meta, "Date taken")).toBe("2024-05-06 07:08:09");
    expect(field(meta, "Orientation")).toBe("Turned a quarter right");
    expect(field(meta, "Exposure time")).toBe("1/250 s");
    expect(field(meta, "Aperture")).toBe("f/2.8");
    expect(field(meta, "ISO")).toBe("200");
    expect(field(meta, "Focal length")).toBe("4.3 mm");
    expect(field(meta, "Lens")).toBe("Test lens 4.3mm");
    expect(field(meta, "Size recorded")).toBe("64 × 48 pixels");
    expect(meta.orientation).toBe(6);
    expect(meta.gps!.lat).toBeCloseTo(51.507361, 5);
    expect(meta.gps!.lon).toBeCloseTo(-0.12775, 5);
    expect(meta.gps!.alt).toBe(35);
  });

  it("tells a blank field from a missing one", () => {
    const meta = readMetadata(fixture("editor-gps.jpg"));
    expect(field(meta, "Software")).toBe("");
    expect(field(meta, "Flash")).toBeUndefined();
  });

  it("says when there are no details", () => {
    const plain = readMetadata(fixture("photo.jpg"));
    expect(plain.status).toBe("none");
    expect(plain.fields).toEqual([]);
    expect(readMetadata(new Uint8Array([1, 2, 3])).status).toBe("none");
  });

  it("reports damaged details without throwing", () => {
    expect(readMetadata(fixture("editor-damaged-exif.jpg")).status).toBe(
      "damaged"
    );
  });

  it("never throws on truncated or scrambled files", () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const name of [...FILES, "editor-damaged-exif.jpg"]) {
      const bytes = fixture(name);
      for (let i = 0; i < 200; i++) {
        const cut = bytes.slice(0, Math.floor(random() * bytes.length));
        // Scramble a few bytes of the details too.
        for (let k = 0; k < 3 && cut.length > 20; k++) {
          cut[Math.floor(random() * Math.min(cut.length, 400))] = Math.floor(
            random() * 256
          );
        }
        expect(() => readMetadata(cut)).not.toThrow();
        expect(() => removeAll(cut)).not.toThrow();
        expect(() => removeLocation(cut)).not.toThrow();
        expect(() => cameraDetailsFor(cut, 10, 10)).not.toThrow();
      }
    }
  });
});

describe("removing photo details", () => {
  it.each(FILES)("removing location from %s keeps everything else", name => {
    const bytes = fixture(name);
    const out = removeLocation(bytes);
    if (!out.ok) throw new Error(out.problem);
    const meta = readMetadata(out.bytes);
    expect(meta.gps).toBeNull();
    expect(field(meta, "Location")).toBeUndefined();
    expect(field(meta, "Camera model")).toBe("T-1000");
    // Nothing moved: the file is the same length.
    expect(out.bytes.length).toBe(bytes.length);
  });

  it("removing location from a PNG keeps the chunk checksum right", () => {
    const out = removeLocation(fixture("editor-gps.png"));
    if (!out.ok) throw new Error(out.problem);
    const {exifBlock} = readMetadata(out.bytes).ranges;
    const end = exifBlock!.start + exifBlock!.length - 4;
    const stored = new DataView(out.bytes.buffer).getUint32(end);
    expect(stored).toBe(crc32(out.bytes, exifBlock!.start + 4, end));
  });

  it.each(FILES)("removing all from %s keeps only the turn setting", name => {
    const out = removeAll(fixture(name));
    if (!out.ok) throw new Error(out.problem);
    expect(out.keptOrientation).toBe(true);
    const meta = readMetadata(out.bytes);
    expect(meta.gps).toBeNull();
    expect(meta.fields).toEqual([
      {label: "Orientation", value: "Turned a quarter right"}
    ]);
  });

  it("fixes the WebP size and flags after removing", () => {
    const out = removeAll(fixture("editor-gps.webp"));
    if (!out.ok) throw new Error(out.problem);
    const view = new DataView(out.bytes.buffer, out.bytes.byteOffset);
    expect(view.getUint32(4, true)).toBe(out.bytes.length - 8);
    expect(out.bytes.length % 2).toBe(0);
    const flags = out.bytes[readMetadata(out.bytes).ranges.vp8xFlags!]!;
    expect(flags & 0x08).toBe(0x08); // the small turn-setting block
    expect(flags & 0x04).toBe(0);
  });

  it("removes a damaged block entirely", () => {
    const out = removeAll(fixture("editor-damaged-exif.jpg"));
    if (!out.ok) throw new Error(out.problem);
    expect(readMetadata(out.bytes).status).toBe("none");
    expect(removeLocation(fixture("editor-damaged-exif.jpg")).ok).toBe(false);
  });
});

describe("keeping camera details in an edited JPG", () => {
  it("drops location and thumbnail, resets the turn, sets the size", () => {
    const original = fixture("editor-gps.jpg");
    const details = cameraDetailsFor(original, 1200, 900);
    if (!details.ok) throw new Error(details.reason);
    const plain = fixture("photo.jpg");
    const out = insertIntoJpeg(plain, details.segment);
    const meta = readMetadata(out);
    expect(meta.gps).toBeNull();
    expect(field(meta, "Camera model")).toBe("T-1000");
    expect(field(meta, "Orientation")).toBe("Upright");
    expect(field(meta, "Size recorded")).toBe("1200 × 900 pixels");
    const text = Buffer.from(out).toString("latin1");
    expect(text).not.toContain("THUMBNAIL-OF-THE-UNEDITED-PHOTO");
    // Straight after the JFIF header, before the picture data.
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out.length).toBe(plain.length + details.segment.length);
  });

  it("says when there's nothing to keep", () => {
    expect(cameraDetailsFor(fixture("photo.jpg"), 1, 1)).toEqual({
      ok: false,
      reason: "none"
    });
  });
});
