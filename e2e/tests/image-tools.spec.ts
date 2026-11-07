import {expect, Page, test} from "@playwright/test";
import {unzipSync} from "fflate";
import {fixture, openTool, saveDownload, watchNetwork} from "./helpers";

async function addImages(page: Page, inputId: string, files: string[]) {
  await page.locator(`#${inputId}-files`).setInputFiles(files.map(fixture));
  await expect(page.getByText(/images? added/)).toBeVisible();
}

/* Decodes an image file in the page and returns its size and the colours
   at the given points (as [r, g, b, a]). */
async function pixels(page: Page, bytes: Buffer, points: [number, number][]) {
  return page.evaluate(
    async ({data, points}) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)]));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        colours: points.map(([x, y]) =>
          Array.from(ctx.getImageData(x, y, 1, 1).data)
        )
      };
    },
    {data: Array.from(bytes), points}
  );
}

/* A field by its exact visible label (labels here also contain option
   names and hints, so getByLabel would match more than one). */
const field = (page: Page, label: string) =>
  page
    .locator(".tool-field", {
      has: page.locator(".tool-field-label", {
        hasText: new RegExp(`^${label}$`)
      })
    })
    .locator("select, input");
const sizeSelect = (page: Page) => field(page, "Size");

const near = (actual: number[], expected: number[]) =>
  expected.every((value, i) => Math.abs(actual[i]! - value) < 40);

test.describe("Bulk Image Resizer", () => {
  test("turns phone photos upright and keeps their shape (Contain)", async ({
    page
  }) => {
    await openTool(page, "bulk-image-resizer");
    const network = watchNetwork(page);
    await addImages(page, "resizer-input", ["rotated-photo.jpg"]);
    await sizeSelect(page).selectOption("custom");
    await page.getByLabel("Width (pixels)").fill("150");
    await page.getByLabel("Height (pixels)").fill("200");
    await page.getByRole("button", {name: "Resize images"}).click();
    await expect(page.locator(".tool-image-card")).toContainText(
      "300 × 400 → 150 × 200"
    );
    const out = await saveDownload(page, () =>
      page
        .locator(".tool-image-card")
        .getByRole("button", {name: "Download"})
        .click()
    );
    expect(out.name).toBe("rotated-photo.jpg");
    // Stored 400×300 and turned 90° clockwise: blue top-left, red top-right,
    // yellow bottom-left, green bottom-right.
    const {width, height, colours} = await pixels(page, out.bytes, [
      [20, 20],
      [130, 20],
      [20, 180],
      [130, 180]
    ]);
    expect([width, height]).toEqual([150, 200]);
    expect(near(colours[0]!, [0, 0, 255])).toBe(true);
    expect(near(colours[1]!, [255, 0, 0])).toBe(true);
    expect(near(colours[2]!, [255, 255, 0])).toBe(true);
    expect(near(colours[3]!, [0, 255, 0])).toBe(true);
    network.expectNothingSent();
  });

  test("pads PNGs with transparency, and JPGs with the chosen colour", async ({
    page
  }) => {
    await openTool(page, "bulk-image-resizer");
    await addImages(page, "resizer-input", ["transparent.png"]);
    await sizeSelect(page).selectOption("500x500");
    await page.getByRole("button", {name: "Resize images"}).click();
    let out = await saveDownload(page, () =>
      page
        .locator(".tool-image-card")
        .getByRole("button", {name: "Download"})
        .click()
    );
    let result = await pixels(page, out.bytes, [
      [2, 2],
      [250, 250]
    ]);
    expect(result.colours[0]![3]).toBe(0); // see-through padding
    expect(result.colours[1]![3]).toBe(255);

    await page.getByLabel("Save as").selectOption("jpeg");
    await page.locator("input[type=color]").fill("#ff0000");
    await page.getByRole("button", {name: "Resize images"}).click();
    await expect(page.locator(".tool-image-warnings")).toContainText(
      "transparent areas were filled"
    );
    out = await saveDownload(page, () =>
      page
        .locator(".tool-image-card")
        .getByRole("button", {name: "Download"})
        .click()
    );
    expect(out.name).toBe("transparent.jpg");
    result = await pixels(page, out.bytes, [[2, 2]]);
    expect(near(result.colours[0]!, [255, 0, 0])).toBe(true);
  });

  test("warns when Cover crops or Stretch distorts", async ({page}) => {
    await openTool(page, "bulk-image-resizer");
    await addImages(page, "resizer-input", ["photo.jpg"]);
    await sizeSelect(page).selectOption("500x500");
    await page.getByRole("button", {name: "Cover"}).click();
    await page.getByRole("button", {name: "Resize images"}).click();
    await expect(page.locator(".tool-image-warnings")).toContainText("Cropped");
    await page.getByRole("button", {name: "Stretch"}).click();
    await page.getByRole("button", {name: "Resize images"}).click();
    await expect(page.locator(".tool-image-warnings")).toContainText(
      "Stretched"
    );
  });

  test("refuses problem files and downloads a batch as a ZIP with unique names", async ({
    page
  }) => {
    await openTool(page, "bulk-image-resizer");
    await addImages(page, "resizer-input", [
      "photo.jpg",
      "photo.webp",
      "transparent.png",
      "damaged.jpg",
      "not-an-image.png"
    ]);
    // Problem files are refused straight away, with the reason, and the rest are added.
    const problems = page.getByRole("alert");
    await expect(problems).toContainText(
      "“damaged.jpg” isn't a JPG, PNG, WebP image (or it's damaged)"
    );
    await expect(problems).toContainText(
      "“not-an-image.png” isn't a JPG, PNG, WebP image"
    );
    await expect(page.getByText("3 images added")).toBeVisible();
    await page
      .locator("#resizer-input-files")
      .setInputFiles([fixture("photo.jpg")]); // the same name again
    await sizeSelect(page).selectOption("percent");
    await field(page, "Percentage").fill("25");
    await page.getByLabel("Save as").selectOption("jpeg");
    await page.getByRole("button", {name: "Resize images"}).click();
    await expect(page.locator(".tool-summary")).toContainText("Resized4");
    await expect(page.locator(".tool-summary")).toContainText(
      "Couldn't resize0"
    );
    const zip = await saveDownload(page, () =>
      page.getByRole("button", {name: /Download all \(4\) as ZIP/}).click()
    );
    expect(Object.keys(unzipSync(new Uint8Array(zip.bytes))).sort()).toEqual([
      "photo (2).jpg",
      "photo (3).jpg",
      "photo.jpg",
      "transparent.jpg"
    ]);
  });
});

test.describe("Smart Image Compressor", () => {
  test("compresses a photo and a screenshot, and shows before and after", async ({
    page
  }) => {
    await openTool(page, "smart-image-compressor");
    const network = watchNetwork(page);
    await addImages(page, "compressor-input", ["photo.jpg", "screenshot.png"]);
    await page.getByRole("button", {name: "Compress images"}).click();
    await expect(page.locator(".tool-summary")).toContainText("Compressed2");
    const cards = page.locator(".tool-image-card");
    await expect(cards.nth(0)).toContainText(/−\d+%/);
    await expect(cards.nth(1)).toContainText("Colours were reduced to 256");
    await cards.nth(1).getByRole("button", {name: "Compare"}).click();
    await expect(page.locator(".tool-compare img")).toHaveCount(2);
    const png = await saveDownload(page, () =>
      cards.nth(1).getByRole("button", {name: "Download"}).click()
    );
    expect(png.name).toBe("screenshot.png");
    expect(png.bytes.length).toBeLessThan(239801 / 2);
    expect((await pixels(page, png.bytes, [[1, 1]])).width).toBe(900);
    network.expectNothingSent();
  });

  test("reaches a target size, and asks before resizing", async ({page}) => {
    await openTool(page, "smart-image-compressor");
    await addImages(page, "compressor-input", ["photo.jpg"]);
    await page.getByRole("button", {name: "A file size"}).click();
    await page.getByLabel("Each image at most").fill("150");
    await page.getByRole("button", {name: "Compress images"}).click();
    let out = await saveDownload(page, () =>
      page
        .locator(".tool-image-card")
        .getByRole("button", {name: "Download"})
        .click()
    );
    expect(out.bytes.length).toBeLessThanOrEqual(150 * 1024);

    await page.getByLabel("Each image at most").fill("8");
    await page.getByRole("button", {name: "Compress images"}).click();
    await expect(page.locator(".tool-image-warnings")).toContainText(
      "over your target"
    );
    await page
      .getByRole("button", {name: "Make it smaller in size to fit"})
      .click();
    await expect(page.locator(".tool-image-warnings")).toContainText(
      "Made smaller to reach the target"
    );
    out = await saveDownload(page, () =>
      page
        .locator(".tool-image-card")
        .getByRole("button", {name: "Download"})
        .click()
    );
    expect(out.bytes.length).toBeLessThanOrEqual(8 * 1024);
  });

  test("offers WebP when a PNG can't reach the target", async ({page}) => {
    await openTool(page, "smart-image-compressor");
    await addImages(page, "compressor-input", ["screenshot.png"]);
    await page.getByRole("button", {name: "A file size"}).click();
    await page.getByLabel("Each image at most").fill("3");
    await page.getByRole("button", {name: "Compress images"}).click();
    await expect(page.locator(".tool-image-warnings")).toContainText(
      "over your target"
    );
    await page
      .getByRole("button", {name: "Save as WebP instead to fit"})
      .click();
    await expect(page.locator(".tool-image-warnings")).toContainText(
      "Saved as WebP"
    );
    const out = await saveDownload(page, () =>
      page
        .locator(".tool-image-card")
        .getByRole("button", {name: "Download"})
        .click()
    );
    expect(out.name).toBe("screenshot.webp");
    expect(out.bytes.length).toBeLessThan(239801);
  });

  test("keeps transparency in PNGs and never makes files bigger", async ({
    page
  }) => {
    await openTool(page, "smart-image-compressor");
    await addImages(page, "compressor-input", [
      "transparent.png",
      "rotated-photo.jpg"
    ]);
    await page.getByRole("button", {name: "My own"}).click();
    await page.getByLabel(/Quality: /).fill("100");
    await page.getByRole("button", {name: "Compress images"}).click();
    await expect(page.locator(".tool-summary")).toContainText("Compressed2");
    const cards = page.locator(".tool-image-card");
    const png = await saveDownload(page, () =>
      cards.nth(0).getByRole("button", {name: "Download"}).click()
    );
    expect((await pixels(page, png.bytes, [[2, 2]])).colours[0]![3]).toBe(0);
    expect(png.bytes.length).toBeLessThanOrEqual(5795);
    // At full quality the photo would get bigger, so the original is kept.
    await expect(cards.nth(1)).toContainText("already well compressed");
  });
});
