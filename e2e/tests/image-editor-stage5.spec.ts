import {expect, Page, test} from "@playwright/test";
import {readMetadata} from "../../src/services/image-editor/logic/exif";
import {fixture, openTool, pixels, saveDownload, watchNetwork} from "./helpers";

/* Stage 5: Colour picker, Photo details, Collage. */

const status = (page: Page) => page.locator(".editor-status");
const panel = (page: Page) => page.locator(".editor-panel");

async function open(page: Page, name: string) {
  await openTool(page, "image-editor");
  const network = watchNetwork(page);
  await page.locator("#editor-files").setInputFiles(fixture(name));
  await expect(status(page)).toContainText("StatusReady");
  return network;
}

async function useTool(page: Page, name: string) {
  await page
    .locator(".editor-tools")
    .getByRole("button", {name, exact: true})
    .click();
}

const value = (page: Page, label: "HEX" | "RGB" | "HSL") =>
  panel(page).getByLabel(label, {exact: true});

/** Clicks the picker at a point in image pixels (at the current zoom). */
async function pickAt(page: Page, x: number, y: number, zoom = 1) {
  const surface = page.locator(".editor-picker-surface");
  await surface.scrollIntoViewIfNeeded();
  await surface.click({position: {x: (x + 0.5) * zoom, y: (y + 0.5) * zoom}});
}

async function download(page: Page, name: RegExp) {
  const button = panel(page).getByRole("button", {name});
  await expect(button).toBeEnabled({timeout: 20_000});
  return saveDownload(page, () => button.click());
}

/** A plain PNG of one colour, drawn in the page. */
async function solid(page: Page, colour: string, w: number, h: number) {
  const bytes = await page.evaluate(
    async ({colour, w, h}) => {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, w, h);
      const blob = await canvas.convertToBlob({type: "image/png"});
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    {colour, w, h}
  );
  return {
    name: `${colour.slice(1)}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(bytes)
  };
}

const near = (got: number[], want: number[], by = 2) =>
  want.every((v, i) => Math.abs(got[i]! - v) <= by);

test.describe("Image Editor — Stage 5: Colour picker", () => {
  test("picks the right pixel, including see-through ones; recent colours clear", async ({
    page,
    browserName
  }) => {
    if (browserName === "chromium") {
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    const network = await open(page, "transparent.png"); // 300 × 200, circle in the middle
    await page.getByRole("button", {name: "100%"}).click();
    await useTool(page, "Colour picker");
    await expect(panel(page)).toContainText(
      "Colours are read from the image as this browser shows it"
    );

    await pickAt(page, 150, 100);
    await expect(value(page, "HEX")).toHaveText("#4F46E5");
    await expect(value(page, "RGB")).toHaveText("rgb(79, 70, 229)");
    await expect(value(page, "HSL")).toHaveText("hsl(243, 75%, 59%)");

    await panel(page).getByRole("button", {name: "Copy HEX"}).click();
    const copied = panel(page).locator("[role=status]").first();
    if (browserName === "chromium") {
      await expect(copied).toHaveText("Copied HEX: #4F46E5");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        "#4F46E5"
      );
    } else {
      await expect(copied).toContainText(/Copied HEX|didn't allow copying/);
    }

    await pickAt(page, 3, 3);
    await expect(value(page, "HEX")).toHaveText("#00000000");
    await expect(value(page, "RGB")).toHaveText("rgba(0, 0, 0, 0)");
    await expect(panel(page)).toContainText("fully see-through");

    const recent = panel(page).getByRole("button", {name: /^Recent colour/});
    await expect(recent).toHaveCount(2);
    await panel(page).getByRole("button", {name: "Clear"}).click();
    await expect(recent).toHaveCount(0);

    await panel(page)
      .getByRole("button", {name: "Find the main colours"})
      .click();
    const main = panel(page).getByRole("button", {name: /^Main colour/});
    await expect(main.first()).toHaveAccessibleName("Main colour #4F46E5");
    const before = await main.count();
    await panel(page)
      .getByRole("button", {name: "Remove #4F46E5 from the main colours"})
      .click();
    await expect(main).toHaveCount(before - 1);
    network.expectNothingSent();
  });

  test("reads the edited image at the right place, at 50% zoom", async ({
    page
  }) => {
    // screenshot.png has a #4f46e5 box at x 620–860, y 40–160 of 900 × 600.
    const network = await open(page, "screenshot.png");
    await useTool(page, "Rotate & flip");
    await page.getByRole("button", {name: "Mirror left–right"}).click();
    await page.getByRole("button", {name: "100%"}).click();
    await page.getByRole("button", {name: "Zoom out"}).click();
    await page.getByRole("button", {name: "Zoom out"}).click();
    await expect(status(page)).toContainText("Zoom50%");
    await useTool(page, "Colour picker");
    // Mirrored, the box is at x 40–280.
    await pickAt(page, 100, 100, 0.5);
    await expect(value(page, "HEX")).toHaveText("#4F46E5");
    await pickAt(page, 700, 100, 0.5);
    await expect(value(page, "HEX")).not.toHaveText("#4F46E5");
    network.expectNothingSent();
  });

  test("picks with the keyboard", async ({page}) => {
    const network = await open(page, "transparent.png");
    await useTool(page, "Colour picker");
    const surface = page.locator(".editor-picker-surface");
    await surface.focus();
    // The cross starts in the middle (150, 100): inside the circle.
    await page.keyboard.press("Enter");
    await expect(value(page, "HEX")).toHaveText("#4F46E5");
    for (let i = 0; i < 14; i++) await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(value(page, "HEX")).toHaveText("#00000000");
    network.expectNothingSent();
  });
});

test.describe("Image Editor — Stage 5: Photo details", () => {
  test("shows the details, location as numbers only", async ({page}) => {
    const network = await open(page, "editor-gps.jpg");
    await useTool(page, "Photo details");
    const list = page.locator(".editor-meta-list");
    await expect(list).toContainText("Camera makeTestcam");
    await expect(list).toContainText("Camera modelT-1000");
    await expect(list).toContainText("Date taken2024-05-06 07:08:09");
    await expect(list).toContainText("Exposure time1/250 s");
    await expect(list).toContainText("Location51.507361, -0.12775");
    await expect(list).toContainText("Software(empty)");
    await expect(panel(page).locator("a")).toHaveCount(0);
    network.expectNothingSent();
  });

  test("removing the location gives a checked file without it, same pixels", async ({
    page
  }) => {
    const network = await open(page, "editor-gps.jpg");
    await useTool(page, "Photo details");
    await panel(page).getByRole("button", {name: "Remove location"}).click();
    await expect(panel(page)).toContainText("Same picture quality");
    const out = await download(page, /^Download editor-gps-clean\.jpg/);
    expect(out.name).toBe("editor-gps-clean.jpg");

    const meta = readMetadata(new Uint8Array(out.bytes));
    expect(meta.gps).toBeNull();
    expect(meta.fields.find(f => f.label === "Camera model")?.value).toBe(
      "T-1000"
    );
    const original = require("fs").readFileSync(fixture("editor-gps.jpg"));
    expect(out.bytes.length).toBe(original.length);
    // It opens, and shows the same picture.
    const a = await pixels(page, out.bytes, [
      [10, 10],
      [40, 30]
    ]);
    const b = await pixels(page, original, [
      [10, 10],
      [40, 30]
    ]);
    expect(a).toEqual(b);

    // Opened in the editor, the location is "Not recorded".
    await page.locator("#editor-open-file").setInputFiles({
      name: "clean.jpg",
      mimeType: "image/jpeg",
      buffer: out.bytes
    });
    await useTool(page, "Photo details");
    await expect(page.locator(".editor-meta-list")).toContainText(
      "LocationNot recorded"
    );
    network.expectNothingSent();
  });

  test("removing all details from a WebP keeps the turn setting", async ({
    page
  }) => {
    const network = await open(page, "editor-gps.webp");
    await useTool(page, "Photo details");
    await panel(page).getByRole("button", {name: "Remove all details"}).click();
    await expect(panel(page)).toContainText("The turn setting was kept");
    const out = await download(page, /^Download editor-gps-clean\.webp/);
    const meta = readMetadata(new Uint8Array(out.bytes));
    expect(meta.fields).toEqual([
      {label: "Orientation", value: "Turned a quarter right"}
    ]);
    const opened = await pixels(page, out.bytes, [[1, 1]]);
    expect(opened.width).toBeGreaterThan(0);
    network.expectNothingSent();
  });

  test("a file without details says so", async ({page}) => {
    const network = await open(page, "photo.jpg");
    await useTool(page, "Photo details");
    await expect(panel(page)).toContainText("This file has no photo details.");
    network.expectNothingSent();
  });

  test("Save can keep camera details in a JPG, never the location", async ({
    page
  }) => {
    const network = await open(page, "editor-gps.jpg");
    await page.getByRole("button", {name: "Save", exact: true}).first().click();
    await page.getByLabel("File type").selectOption("jpeg");
    await page.getByLabel("Keep camera details (without location)").check();
    const out = await download(page, /^Download JPG/);
    const meta = readMetadata(new Uint8Array(out.bytes));
    expect(meta.gps).toBeNull();
    const get = (label: string) =>
      meta.fields.find(f => f.label === label)?.value;
    expect(get("Camera model")).toBe("T-1000");
    expect(get("Orientation")).toBe("Upright");
    // The fixture is 64 × 48 stored sideways, so the upright picture is 48 × 64.
    expect(get("Size recorded")).toBe("48 × 64 pixels");
    expect(Buffer.from(out.bytes).toString("latin1")).not.toContain(
      "THUMBNAIL"
    );

    // Without the box ticked, nothing is kept.
    await page.getByLabel("Keep camera details (without location)").uncheck();
    const plain = await download(page, /^Download JPG/);
    // (Safari's own JPG encoder adds a few basic details of its own, but
    // nothing from the original photo.)
    const plainMeta = readMetadata(new Uint8Array(plain.bytes));
    expect(plainMeta.gps).toBeNull();
    expect(
      plainMeta.fields.find(f => f.label === "Camera model")
    ).toBeUndefined();
    expect(
      plainMeta.fields.find(f => f.label === "Camera make")
    ).toBeUndefined();
    network.expectNothingSent();
  });
});

test.describe("Image Editor — Stage 5: Collage", () => {
  async function startCollage(
    page: Page,
    files: Awaited<ReturnType<typeof solid>>[]
  ) {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await page.getByRole("button", {name: "Make a collage"}).click();
    await page.locator("#collage-files").setInputFiles(files);
    await expect(page.locator(".editor-collage-card")).toHaveCount(
      files.length
    );
    return network;
  }

  async function size(page: Page, w: number, h: number, gap = 0, margin = 0) {
    await page.getByLabel("Width (px)").fill(String(w));
    await page.getByLabel("Height (px)").fill(String(h));
    await page.getByLabel("Gap (px)").fill(String(gap));
    await page.getByLabel("Margin (px)").fill(String(margin));
  }

  async function savePng(page: Page) {
    const open = page.getByRole("button", {name: "Save the collage"});
    if (await open.isVisible()) await open.click();
    await panel(page).getByLabel("File type").selectOption("png");
    return download(page, /^Download PNG/);
  }

  const RED = [255, 0, 0];
  const GREEN = [0, 255, 0];
  const BLUE = [0, 0, 255];
  const YELLOW = [255, 255, 0];
  const WHITE = [255, 255, 255];

  test("a 2 × 2 collage puts the pictures in order, and reordering moves them", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    const files = [
      await solid(page, "#ff0000", 400, 400),
      await solid(page, "#00ff00", 400, 400),
      await solid(page, "#0000ff", 400, 400),
      await solid(page, "#ffff00", 400, 400)
    ];
    const network = await startCollage(page, files);
    await page.getByLabel("Layout").selectOption("grid2");
    await size(page, 400, 400);
    await expect(page.locator(".editor-collage-preview")).toContainText(
      "400 × 400 pixels"
    );

    const centres: [number, number][] = [
      [100, 100],
      [300, 100],
      [100, 300],
      [300, 300]
    ];
    let out = await pixels(page, (await savePng(page)).bytes, centres);
    [RED, GREEN, BLUE, YELLOW].forEach((c, i) =>
      expect(near(out.colours[i]!, c)).toBe(true)
    );

    await page.getByRole("button", {name: "Move picture 1 down"}).click();
    out = await pixels(page, (await savePng(page)).bytes, centres);
    [GREEN, RED, BLUE, YELLOW].forEach((c, i) =>
      expect(near(out.colours[i]!, c)).toBe(true)
    );

    await page.getByRole("button", {name: "Remove picture 4"}).click();
    await expect(page.locator(".editor-collage-card")).toHaveCount(3);
    out = await pixels(page, (await savePng(page)).bytes, centres);
    expect(near(out.colours[3]!, WHITE)).toBe(true);
    network.expectNothingSent();
  });

  test("Show all keeps a whole portrait picture, with background beside it", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    const network = await startCollage(page, [
      await solid(page, "#ff0000", 200, 400)
    ]);
    await page.getByLabel("Layout").selectOption("cols2");
    await size(page, 800, 400);
    await page.getByRole("button", {name: "Show all"}).click();
    let out = await pixels(page, (await savePng(page)).bytes, [
      [200, 200],
      [20, 200],
      [380, 200],
      [600, 200]
    ]);
    expect(out.width).toBe(800);
    expect(near(out.colours[0]!, RED)).toBe(true);
    expect(near(out.colours[1]!, WHITE)).toBe(true);
    expect(near(out.colours[2]!, WHITE)).toBe(true);
    expect(near(out.colours[3]!, WHITE)).toBe(true);

    await page.getByRole("button", {name: "Fill the space"}).click();
    await expect(panel(page)).toContainText("some edges are cut off");
    out = await pixels(page, (await savePng(page)).bytes, [[20, 200]]);
    expect(near(out.colours[0]!, RED)).toBe(true);
    network.expectNothingSent();
  });

  test("a side-by-side strip keeps each picture's shape", async ({page}) => {
    await openTool(page, "image-editor");
    const network = await startCollage(page, [
      await solid(page, "#ff0000", 400, 200),
      await solid(page, "#0000ff", 100, 200)
    ]);
    await page.getByLabel("Layout").selectOption("hstrip");
    await page.getByLabel("Height (px)").fill("200");
    await page.getByLabel("Gap (px)").fill("0");
    await page.getByLabel("Margin (px)").fill("0");
    await expect(page.locator(".editor-collage-preview")).toContainText(
      "500 × 200 pixels"
    );
    const out = await pixels(page, (await savePng(page)).bytes, [
      [395, 100],
      [405, 100]
    ]);
    expect([out.width, out.height]).toEqual([500, 200]);
    expect(near(out.colours[0]!, RED)).toBe(true);
    expect(near(out.colours[1]!, BLUE)).toBe(true);
    network.expectNothingSent();
  });

  test("leaving the collage keeps the image being edited", async ({page}) => {
    await openTool(page, "image-editor");
    await page.locator("#editor-files").setInputFiles(fixture("photo.jpg"));
    await expect(status(page)).toContainText("Original1,600 × 1,200");
    await page.getByRole("button", {name: "Turn right"}).click();
    await page.getByRole("button", {name: "Make a collage"}).click();
    await expect(page.locator("#collage-files")).toBeAttached();
    await page.getByRole("button", {name: "Edit one image"}).click();
    await expect(status(page)).toContainText("Result1,200 × 1,600");
  });
});
