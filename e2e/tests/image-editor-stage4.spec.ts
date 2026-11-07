import {expect, Page, test} from "@playwright/test";
import fs from "fs";
import {fixture, openTool, pixels, saveDownload, watchNetwork} from "./helpers";

/* Stage 4: Colour adjust, Effects, Hide areas and Watermark. */

const status = (page: Page) => page.locator(".editor-status");
const tools = (page: Page) => page.locator(".editor-tools");

async function openPhoto(page: Page, name = "photo.jpg") {
  await openTool(page, "image-editor");
  const network = watchNetwork(page);
  await page.locator("#editor-files").setInputFiles(fixture(name));
  await expect(status(page)).toContainText("Original");
  return network;
}

async function useTool(page: Page, name: string) {
  await tools(page).getByRole("button", {name, exact: true}).click();
}

/** Types a number into a setting's number field and records it. */
async function setNumber(page: Page, label: string, value: number) {
  const field = page.getByLabel(`${label}, as a number`, {exact: true});
  await field.fill(String(value));
  await field.press("Enter");
}

async function ready(page: Page) {
  await expect(status(page)).toContainText("StatusReady");
}

async function savePng(page: Page) {
  await page.getByRole("button", {name: "Save", exact: true}).first().click();
  await page.getByLabel("File type").selectOption("png");
  const button = page
    .locator(".editor-panel")
    .getByRole("button", {name: "Download PNG"});
  await expect(button).toBeEnabled({timeout: 20_000});
  return saveDownload(page, () => button.click());
}

/** The preview's colours at some points (at 100% zoom, image pixels). */
function previewAt(page: Page, points: [number, number][]) {
  return page.evaluate(points => {
    const canvas = document.querySelector(
      ".editor-canvas"
    ) as HTMLCanvasElement;
    const probe = document.createElement("canvas");
    probe.width = canvas.width;
    probe.height = canvas.height;
    const ctx = probe.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);
    return points.map(([x, y]) =>
      Array.from(ctx.getImageData(x, y, 1, 1).data)
    );
  }, points);
}

const SPOTS: [number, number][] = [
  [30, 40],
  [800, 600],
  [1570, 60],
  [420, 1150],
  [1200, 900]
];

/** Saves a PNG and checks it matches the preview at 100% zoom. */
async function expectPreviewMatchesSave(page: Page) {
  await page.getByRole("button", {name: "100%"}).click();
  const file = await savePng(page);
  await ready(page);
  await page.waitForTimeout(300);
  const shown = await previewAt(page, SPOTS);
  const saved = await pixels(page, file.bytes, SPOTS);
  SPOTS.forEach((_, i) => {
    for (let c = 0; c < 4; c++) {
      expect(
        Math.abs(saved.colours[i]![c]! - shown[i]![c]!),
        `point ${SPOTS[i]} channel ${c}`
      ).toBeLessThanOrEqual(3);
    }
  });
  return saved;
}

/** A plain PNG of one colour, drawn in the page (for logo tests). */
async function solidPng(page: Page, colour: string, size = 100) {
  const bytes = await page.evaluate(
    async ({colour, size}) => {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, size, size);
      const blob = await canvas.convertToBlob({type: "image/png"});
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    {colour, size}
  );
  return Buffer.from(bytes);
}

async function pickLogo(page: Page, name: string, buffer: Buffer) {
  await page
    .locator("#editor-logo-file")
    .setInputFiles({name, mimeType: "image/png", buffer});
  await expect(page.locator(".editor-logo-name")).toContainText(name);
  await ready(page);
}

test.describe("Image Editor — Stage 4", () => {
  test("colour adjust: preview matches the saved file", async ({page}) => {
    const network = await openPhoto(page);
    await useTool(page, "Colour adjust");
    await setNumber(page, "Brightness", 30);
    await setNumber(page, "Contrast", 20);
    await setNumber(page, "Saturation", -40);
    await setNumber(page, "Hue", 30);
    await setNumber(page, "Warmth", 20);
    await setNumber(page, "Tint", -10);
    await expectPreviewMatchesSave(page);
    network.expectNothingSent();
  });

  test("effects: preview matches the saved file, and Reset all clears them", async ({
    page
  }) => {
    const network = await openPhoto(page);
    await useTool(page, "Effects");
    await setNumber(page, "Black & white", 50);
    await setNumber(page, "Sepia", 30);
    await setNumber(page, "Pixelate", 6);
    await setNumber(page, "Blur", 4);
    await setNumber(page, "Sharpen", 40);
    await page.getByLabel("Invert colours").check();
    await expectPreviewMatchesSave(page);

    await useTool(page, "Effects");
    await page.getByRole("button", {name: "Reset all effects"}).click();
    await expect(
      page.getByRole("button", {name: "Reset all", exact: true})
    ).toBeDisabled();
    network.expectNothingSent();
  });

  test("a solid hidden area is exactly the chosen colour, all over", async ({
    page
  }) => {
    const network = await openPhoto(page);
    await useTool(page, "Hide areas");
    await expect(page.locator(".editor-panel")).toContainText(
      "Blur and pixelation can sometimes be reversed."
    );
    await page.getByRole("button", {name: "Add hidden area"}).click();
    await page.getByLabel("Colour of area 1").fill("#ff00ff");
    await ready(page);
    // The new area covers 35–65% across and 42.5–57.5% down: x 560–1039,
    // y 510–689 on this 1,600 × 1,200 photo.
    const points: [number, number][] = [];
    for (const x of [560, 600, 800, 1000, 1039]) {
      for (const y of [510, 560, 600, 650, 689]) points.push([x, y]);
    }
    const file = await savePng(page);
    const saved = await pixels(page, file.bytes, [...points, [555, 505]]);
    for (const colour of saved.colours.slice(0, -1)) {
      expect(colour).toEqual([255, 0, 255, 255]);
    }
    expect(saved.colours[saved.colours.length - 1]).not.toEqual([
      255, 0, 255, 255
    ]);
    network.expectNothingSent();
  });

  test("an area drawn at 50% zoom lands in the right place at full size", async ({
    page
  }) => {
    const network = await openPhoto(page);
    await useTool(page, "Hide areas");
    await page.getByRole("button", {name: "100%"}).click();
    await page.getByRole("button", {name: "Zoom out"}).click(); // 67%
    await page.getByRole("button", {name: "Zoom out"}).click(); // 50%
    await expect(status(page)).toContainText("Zoom50%");

    const surface = page.locator(".editor-draw-surface");
    await surface.scrollIntoViewIfNeeded();
    const at = (await surface.boundingBox())!;
    // Screen 100,100 → 300,200 at 50% is image 200,200 → 600,400.
    await page.mouse.move(at.x + 100, at.y + 100);
    await page.mouse.down();
    await page.mouse.move(at.x + 300, at.y + 200, {steps: 6});
    await page.mouse.up();
    await expect(
      page.getByRole("region", {name: "Hidden area 1"})
    ).toBeVisible();
    await page.getByLabel("Colour of area 1").fill("#00ff00");
    await ready(page);

    const file = await savePng(page);
    const saved = await pixels(page, file.bytes, [
      [203, 203],
      [597, 397],
      [400, 300],
      [194, 300],
      [606, 300],
      [400, 194],
      [400, 406]
    ]);
    for (const c of saved.colours.slice(0, 3)) {
      expect(c).toEqual([0, 255, 0, 255]);
    }
    for (const c of saved.colours.slice(3)) {
      expect(c).not.toEqual([0, 255, 0, 255]);
    }
    network.expectNothingSent();
  });

  test("blurred and pixelated areas: preview matches the saved file", async ({
    page
  }) => {
    const network = await openPhoto(page);
    await useTool(page, "Hide areas");
    await page.getByRole("button", {name: "Add hidden area"}).click();
    await page.getByLabel("How to hide area 1").selectOption("blur");
    await page.getByRole("button", {name: "Add hidden area"}).click();
    await page.getByLabel("How to hide area 2").selectOption("pixelate");
    await expectPreviewMatchesSave(page);
    network.expectNothingSent();
  });

  test("a logo watermark sits at its corner with the chosen opacity", async ({
    page
  }) => {
    // Several full-size saves, each read back in the page.
    test.slow();
    const network = await openPhoto(page);
    const plain = await savePng(page);
    const before = await pixels(page, plain.bytes, [
      [80, 80],
      [1520, 1120],
      [400, 400]
    ]);

    await useTool(page, "Watermark");
    await page
      .locator(".editor-panel")
      .getByRole("button", {name: "Logo", exact: true})
      .click();
    await pickLogo(page, "red.png", await solidPng(page, "#ff0000"));
    await setNumber(page, "Logo width", 10); // 160 × 160
    await setNumber(page, "Opacity", 50);
    await setNumber(page, "Gap to the edge", 0);
    await page.getByLabel("Position").selectOption("top-left");
    await ready(page);
    const topLeft = await pixels(page, (await savePng(page)).bytes, [
      [80, 80],
      [400, 400]
    ]);
    // Half red over the photo, and the photo untouched elsewhere.
    const halfRed = (photo: number[]) =>
      [255, 0, 0].map((logo, ch) => Math.round((photo[ch]! + logo) / 2));
    const expectNear = (got: number[], want: number[]) =>
      want.forEach((v, ch) =>
        expect(Math.abs(got[ch]! - v)).toBeLessThanOrEqual(3)
      );
    expectNear(topLeft.colours[0]!, halfRed(before.colours[0]!));
    expect(topLeft.colours[1]).toEqual(before.colours[2]);

    await useTool(page, "Watermark");
    await page.getByLabel("Position").selectOption("bottom-right");
    await ready(page);
    await expectPreviewMatchesSave(page);
    const corner = await pixels(page, (await savePng(page)).bytes, [
      [1520, 1120],
      [80, 80]
    ]);
    expectNear(corner.colours[0]!, halfRed(before.colours[1]!));
    expect(corner.colours[1]).toEqual(before.colours[0]);
    network.expectNothingSent();
  });

  test("a logo's see-through areas leave the photo visible", async ({page}) => {
    // Several full-size saves, each read back in the page.
    test.slow();
    const network = await openPhoto(page);
    const plain = await pixels(page, (await savePng(page)).bytes, [[413, 346]]);
    await useTool(page, "Watermark");
    await page
      .locator(".editor-panel")
      .getByRole("button", {name: "Logo", exact: true})
      .click();
    // transparent.png: a solid circle on a see-through 300 × 200 picture.
    await pickLogo(
      page,
      "transparent.png",
      fs.readFileSync(fixture("transparent.png"))
    );
    await setNumber(page, "Logo width", 50); // 800 × 533, from 400,333
    await setNumber(page, "Opacity", 100);
    await page.getByLabel("Position").selectOption("center");
    await ready(page);
    const saved = await pixels(page, (await savePng(page)).bytes, [
      [413, 346],
      [800, 600]
    ]);
    expect(saved.colours[0]).toEqual(plain.colours[0]);
    const [r, g, b] = saved.colours[1]!;
    expect([r, g, b]).toEqual([0x4f, 0x46, 0xe5]);
    network.expectNothingSent();
  });

  test("a text watermark: preview matches the saved file, also tiled", async ({
    page
  }) => {
    // Several full-size saves, each read back in the page.
    test.slow();
    const network = await openPhoto(page);
    await useTool(page, "Watermark");
    await page
      .locator(".editor-panel")
      .getByRole("button", {name: "Text", exact: true})
      .click();
    const text = page.getByLabel("Text", {exact: true});
    await text.fill("© Stage 4 test");
    await text.press("Enter");
    await setNumber(page, "Text size", 20);
    await setNumber(page, "Rotation", -20);
    await page.getByLabel("Position").selectOption("center");
    await ready(page);
    await expectPreviewMatchesSave(page);

    await useTool(page, "Watermark");
    await page.getByLabel("Repeat over the whole picture").check();
    await ready(page);
    await expectPreviewMatchesSave(page);
    network.expectNothingSent();
  });

  test("dragging the watermark moves it, and the arrow keys nudge it", async ({
    page
  }) => {
    const network = await openPhoto(page);
    await useTool(page, "Watermark");
    await page
      .locator(".editor-panel")
      .getByRole("button", {name: "Text", exact: true})
      .click();
    const box = page
      .getByLabel("Watermark", {exact: true})
      .and(page.locator(".editor-box"));
    await box.scrollIntoViewIfNeeded();
    const at = (await box.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x - 150, at.y - 100, {steps: 6});
    await page.mouse.up();
    await expect(page.getByLabel("Position")).toHaveValue("custom");
    const moved = (await box.boundingBox())!;
    expect(moved.x).toBeLessThan(at.x - 100);

    await box.focus();
    await page.keyboard.press("Shift+ArrowRight");
    const nudged = (await box.boundingBox())!;
    expect(nudged.x).toBeGreaterThan(moved.x);
    network.expectNothingSent();
  });

  test("Undo and Redo work across tools", async ({page}) => {
    const network = await openPhoto(page);
    await useTool(page, "Colour adjust");
    await setNumber(page, "Brightness", 40);
    await useTool(page, "Effects");
    await page.getByLabel("Invert colours").check();
    await useTool(page, "Hide areas");
    await page.getByRole("button", {name: "Add hidden area"}).click();
    await useTool(page, "Watermark");
    await page
      .locator(".editor-panel")
      .getByRole("button", {name: "Text", exact: true})
      .click();

    const undo = page.getByRole("button", {name: "Undo"});
    const redo = page.getByRole("button", {name: "Redo"});
    for (let i = 0; i < 4; i++) await undo.click();
    await expect(undo).toBeDisabled();
    await expect(
      page.getByRole("button", {name: "Reset all", exact: true})
    ).toBeDisabled();

    for (let i = 0; i < 4; i++) await redo.click();
    await expect(redo).toBeDisabled();
    await expect(page.getByLabel("Text", {exact: true})).toHaveValue(
      "© Your name"
    );
    await useTool(page, "Hide areas");
    await expect(page.getByLabel("How to hide area 1")).toBeVisible();
    await useTool(page, "Colour adjust");
    await expect(
      page.getByLabel("Brightness, as a number", {exact: true})
    ).toHaveValue("40");
    network.expectNothingSent();
  });

  test("turning removes the hidden areas, with a notice; Undo restores them", async ({
    page
  }) => {
    const network = await openPhoto(page);
    await useTool(page, "Hide areas");
    await page.getByRole("button", {name: "Add hidden area"}).click();
    await useTool(page, "Rotate & flip");
    await page.getByRole("button", {name: "Turn right"}).click();
    await expect(page.locator(".editor .tool-notice")).toContainText(
      "Turning the image removed the hidden areas. Press Undo to bring them back."
    );
    await page.getByRole("button", {name: "Undo"}).click();
    await useTool(page, "Hide areas");
    await expect(page.getByLabel("How to hide area 1")).toBeVisible();
    network.expectNothingSent();
  });

  test("an Undo back to a closed logo asks for it again, without breaking", async ({
    page
  }) => {
    const network = await openPhoto(page);
    await useTool(page, "Watermark");
    await page
      .locator(".editor-panel")
      .getByRole("button", {name: "Logo", exact: true})
      .click();
    const png = await solidPng(page, "#0000ff", 40);
    // Six logos: the editor keeps five, so the first one is closed.
    for (let i = 1; i <= 6; i++) await pickLogo(page, `logo-${i}.png`, png);
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", {name: "Undo"}).click();
    }
    await expect(page.locator(".editor-panel")).toContainText(
      "Pick the logo again"
    );
    await expect(page.locator(".editor-stage-error")).toContainText(
      "Pick the logo again"
    );
    await pickLogo(page, "again.png", png);
    await expect(page.locator(".editor-panel")).not.toContainText(
      "Pick the logo again"
    );
    await expect(page.locator(".editor-stage-error")).toHaveCount(0);
    network.expectNothingSent();
  });
});
