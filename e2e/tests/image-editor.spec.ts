import {expect, Page, test} from "@playwright/test";
import {fixture, openTool, pixels, saveDownload, watchNetwork} from "./helpers";

const near = (actual: number[], expected: number[]) =>
  expected.every((value, i) => Math.abs(actual[i]! - value) < 40);
const BLUE = [0, 0, 255];
const RED = [255, 0, 0];
const YELLOW = [255, 255, 0];
const GREEN = [0, 255, 0];

async function openImage(
  page: Page,
  file: string | Parameters<Page["setInputFiles"]>[1]
) {
  await page
    .locator("#editor-files")
    .setInputFiles(typeof file === "string" ? fixture(file) : file);
}

const status = (page: Page) => page.locator(".editor-status");

async function download(page: Page) {
  const button = page
    .locator(".editor-panel")
    .getByRole("button", {name: /^Download/});
  await expect(button).toBeEnabled();
  return saveDownload(page, () => button.click());
}

async function saveAs(page: Page, format: "jpeg" | "png" | "webp") {
  await page.getByRole("button", {name: "Save", exact: true}).first().click();
  await page.getByLabel("File type").selectOption(format);
}

test.describe("Image Editor", () => {
  test("turns and mirrors a phone photo; the saved file matches the preview exactly", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    // Stored 400×300 with an EXIF turn: upright it is 300×400 with blue
    // top-left, red top-right, yellow bottom-left, green bottom-right.
    await openImage(page, "rotated-photo.jpg");
    await expect(status(page)).toContainText("Original300 × 400 JPG");

    await page.getByRole("button", {name: "Turn right"}).click();
    await page.getByRole("button", {name: "Mirror left–right"}).click();
    await expect(status(page)).toContainText("Result400 × 300");

    await saveAs(page, "png");
    await page.getByLabel("File name").fill("turned");
    const out = await download(page);
    expect(out.name).toBe("turned.png");
    const {width, height, colours} = await pixels(page, out.bytes, [
      [40, 40],
      [360, 40],
      [40, 260],
      [360, 260]
    ]);
    expect([width, height]).toEqual([400, 300]);
    // Turned right: yellow, blue / green, red. Then mirrored: blue, yellow / red, green.
    expect(near(colours[0]!, BLUE)).toBe(true);
    expect(near(colours[1]!, YELLOW)).toBe(true);
    expect(near(colours[2]!, RED)).toBe(true);
    expect(near(colours[3]!, GREEN)).toBe(true);
    network.expectNothingSent();
  });

  test("undo, redo, reset, keyboard shortcuts and showing the original", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    await openImage(page, "photo.jpg");
    const undo = page.getByRole("button", {name: "Undo"});
    const redo = page.getByRole("button", {name: "Redo"});
    await expect(undo).toBeDisabled();
    const original = await status(page)
      .locator("div", {hasText: "Result"})
      .textContent();

    await page.getByRole("button", {name: "Turn left"}).click();
    const turned = await status(page)
      .locator("div", {hasText: "Result"})
      .textContent();
    expect(turned).not.toBe(original);

    await undo.click();
    await expect(status(page)).toContainText(original!);
    await redo.click();
    await expect(status(page)).toContainText(turned!);

    await page.getByRole("button", {name: "Show the original"}).click();
    await expect(status(page)).toContainText(
      `Showing${original!.replace("Result", "")}`
    );
    await page.getByRole("button", {name: "Showing the original"}).click();

    // Keyboard: Ctrl+Z undoes, Ctrl+Shift+Z redoes.
    await page.locator(".editor-stage").focus();
    await page.keyboard.press("Control+z");
    await expect(status(page)).toContainText(original!);
    await page.keyboard.press("Control+Shift+z");
    await expect(status(page)).toContainText(turned!);

    await page.getByRole("button", {name: "Reset all"}).click();
    await expect(status(page)).toContainText(original!);
    // Reset can itself be undone.
    await undo.click();
    await expect(status(page)).toContainText(turned!);
  });

  test("straightening keeps corners see-through in PNG, and fills them in a JPG", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    await openImage(page, "transparent.png");
    await page.getByLabel("Straighten, in degrees").fill("10");
    await expect(status(page)).toContainText("Result331 × 250");

    await saveAs(page, "png");
    const png = await download(page);
    expect(png.name).toBe("transparent-edited.png");
    const corner = await pixels(page, png.bytes, [[1, 1]]);
    expect([corner.width, corner.height]).toEqual([331, 250]);
    expect(corner.colours[0]![3]).toBe(0);

    await page.getByLabel("File type").selectOption("jpeg");
    await expect(page.locator(".editor-panel")).toContainText(
      "JPG can't be see-through"
    );
    await page.locator(".editor-panel input[type=color]").fill("#ff0000");
    const jpg = await download(page);
    expect(jpg.name).toBe("transparent-edited.jpg");
    expect(
      near((await pixels(page, jpg.bytes, [[1, 1]])).colours[0]!, RED)
    ).toBe(true);
  });

  test("opens GIF and BMP images and saves them as PNG", async ({page}) => {
    await openTool(page, "image-editor");
    // A 1×1 white GIF.
    await openImage(page, {
      name: "dot.gif",
      mimeType: "image/gif",
      buffer: Buffer.from(
        "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
        "base64"
      )
    });
    await expect(status(page)).toContainText("Original1 × 1 GIF");
    await page.getByRole("button", {name: "Save", exact: true}).first().click();
    await expect(page.getByLabel("File type")).toHaveValue("png");

    // A 2×1 BMP: one red pixel, one blue (24-bit, rows padded to 4 bytes).
    const bmp = Buffer.alloc(62);
    bmp.write("BM", 0);
    bmp.writeUInt32LE(62, 2);
    bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(2, 18);
    bmp.writeInt32LE(1, 22);
    bmp.writeUInt16LE(1, 26);
    bmp.writeUInt16LE(24, 28);
    bmp.writeUInt32LE(8, 34);
    Buffer.from([0, 0, 255, 255, 0, 0, 0, 0]).copy(bmp, 54);
    page.once("dialog", dialog => void dialog.accept());
    await page.locator("#editor-open-file").setInputFiles({
      name: "two.bmp",
      mimeType: "image/bmp",
      buffer: bmp
    });
    await expect(status(page)).toContainText("Original2 × 1 BMP");
    await saveAs(page, "png");
    const out = await download(page);
    expect(out.name).toBe("two-edited.png");
    const {colours} = await pixels(page, out.bytes, [
      [0, 0],
      [1, 0]
    ]);
    expect(near(colours[0]!, RED)).toBe(true);
    expect(near(colours[1]!, BLUE)).toBe(true);
  });

  test("explains files it can't open", async ({page}) => {
    await openTool(page, "image-editor");
    await openImage(page, "not-an-image.png");
    await expect(page.getByRole("alert")).toContainText(
      "“not-an-image.png” isn't a JPG, PNG, WebP, GIF, BMP or AVIF image"
    );
    await openImage(page, {
      name: "empty.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.alloc(0)
    });
    await expect(page.getByRole("alert")).toContainText(
      "“empty.jpg” is empty."
    );
  });
});
