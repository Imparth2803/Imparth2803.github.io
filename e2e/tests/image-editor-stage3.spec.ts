import {expect, Page, test} from "@playwright/test";
import {fixture, openTool, pixels, saveDownload, watchNetwork} from "./helpers";

const near = (actual: number[], expected: number[]) =>
  expected.every((value, i) => Math.abs(actual[i]! - value) < 40);

const RED = [255, 0, 0];
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
  const label = format === "jpeg" ? "JPG" : format.toUpperCase();
  await expect(
    page
      .locator(".editor-panel")
      .getByRole("button", {name: `Download ${label}`})
  ).toBeEnabled({timeout: 15_000});
}

test.describe("Image Editor — Stage 3", () => {
  test("crops 16:9 on photo.jpg; saved size equals shown size and saved pixels match preview", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "photo.jpg");
    await expect(status(page)).toContainText("Original1,600 × 1,200 JPG");

    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Crop"})
      .click();
    await page.getByLabel("Aspect ratio preset").selectOption("16:9");
    await page.getByRole("button", {name: "Apply crop"}).click();

    await expect(status(page)).toContainText("Result1,600 × 900");
    await page.getByRole("button", {name: "100%"}).click();
    await expect(status(page)).toContainText("StatusReady");
    await page.waitForTimeout(200);

    await saveAs(page, "png");
    await page.getByLabel("File name").fill("cropped-16-9");
    const out = await download(page);
    expect(out.name).toBe("cropped-16-9.png");

    const samplePoints: [number, number][] = [
      [20, 20],
      [1580, 20],
      [20, 880],
      [1580, 880]
    ];
    const {
      width,
      height,
      colours: fileColours
    } = await pixels(page, out.bytes, samplePoints);
    expect([width, height]).toEqual([1600, 900]);

    // Sample preview pixels from the rendered canvas at 100% zoom
    const previewColours = await page.evaluate(points => {
      const canvas = document.querySelector(
        ".editor-canvas"
      ) as HTMLCanvasElement;
      const probe = document.createElement("canvas");
      probe.width = canvas.width;
      probe.height = canvas.height;
      const ctx = probe.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      return points.map(([x, y]: [number, number]) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      });
    }, samplePoints);

    for (let i = 0; i < samplePoints.length; i++) {
      for (let channel = 0; channel < 3; channel++) {
        expect(
          Math.abs(fileColours[i]![channel]! - previewColours[i]![channel]!)
        ).toBeLessThanOrEqual(2);
      }
    }
    network.expectNothingSent();
  });

  test("crops with the keyboard only", async ({page}) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "photo.jpg");

    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Crop"})
      .click();
    const cropBox = page.getByLabel("Crop area");
    await cropBox.focus();

    // Move with Arrow keys (Shift for 10)
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    // Resize with Alt+Arrow
    await page.keyboard.press("Alt+Shift+ArrowLeft");
    await page.keyboard.press("Alt+Shift+ArrowUp");

    await page.getByRole("button", {name: "Apply crop"}).click();
    await expect(status(page)).toContainText("Result1,590 × 1,190");
    network.expectNothingSent();
  });

  test("circle crop keeps corners see-through in PNG, and fills them with background colour in JPG", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "photo.jpg");

    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Crop"})
      .click();
    await page.getByRole("button", {name: "Circle"}).click();
    await page.getByRole("button", {name: "Apply crop"}).click();
    await expect(status(page)).toContainText("Result1,200 × 1,200");

    // PNG: see-through corners
    await saveAs(page, "png");
    const pngOut = await download(page);
    const pngCorner = await pixels(page, pngOut.bytes, [[2, 2]]);
    expect(pngCorner.colours[0]![3]).toBe(0);

    // JPG: background colour filled
    await page.getByLabel("File type").selectOption("jpeg");
    await expect(page.locator(".editor-panel")).toContainText(
      "JPG can't be see-through"
    );
    await page.locator(".editor-panel input[type=color]").fill("#ff0000");
    const jpgOut = await download(page);
    const jpgCorner = await pixels(page, jpgOut.bytes, [[2, 2]]);
    expect(near(jpgCorner.colours[0]!, RED)).toBe(true);
    network.expectNothingSent();
  });

  test("turning after a crop clears it with a notice, and Undo restores both", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "photo.jpg");

    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Crop"})
      .click();
    await page.getByLabel("Aspect ratio preset").selectOption("1:1");
    await page.getByRole("button", {name: "Apply crop"}).click();
    await expect(status(page)).toContainText("Result1,200 × 1,200");

    // Turn image
    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Rotate & flip"})
      .click();
    await page.getByRole("button", {name: "Turn right"}).click();

    // Notice is shown and crop is cleared
    await expect(page.locator(".editor .tool-notice")).toContainText(
      "Turning the image removed the crop. Press Undo to bring it back."
    );
    await expect(status(page)).toContainText("Result1,200 × 1,600");

    // Undo restores both
    await page.getByRole("button", {name: "Undo"}).click();
    await expect(status(page)).toContainText("Result1,200 × 1,200");
    network.expectNothingSent();
  });

  test("padding with transparent PNG keeps corners alpha 0 and equals shown size", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "transparent.png"); // 300 × 200

    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Border & padding"})
      .click();
    await page.getByLabel("Transparent").check();
    await page.getByLabel("Padding (px)").fill("20");

    await expect(status(page)).toContainText("Result340 × 240");

    await saveAs(page, "png");
    const out = await download(page);
    const corner = await pixels(page, out.bytes, [[1, 1]]);
    expect([corner.width, corner.height]).toEqual([340, 240]);
    expect(corner.colours[0]![3]).toBe(0);
    network.expectNothingSent();
  });

  test("border with JPG gives exact border pixel colour", async ({page}) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "photo.jpg");

    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Border & padding"})
      .click();
    await page.getByLabel("Border width (px)").fill("20");
    await page.getByLabel("Border colour").fill("#00ff00");
    await page.getByLabel("Padding (px)").fill("0");

    await saveAs(page, "jpeg");
    const out = await download(page);
    const corner = await pixels(page, out.bytes, [[5, 5]]);
    expect(near(corner.colours[0]!, GREEN)).toBe(true);
    network.expectNothingSent();
  });

  test("oversize padding gives a plain error and no crash", async ({page}) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "photo.jpg");

    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Border & padding"})
      .click();
    await page.getByLabel("Padding (px)").fill("20000");

    await expect(page.locator(".editor-panel")).toContainText(
      "larger than this device can make"
    );

    // Switch to Save and ensure the app is not crashed
    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Save"})
      .click();
    await expect(page.locator(".editor-panel h2")).toHaveText("Save");
    network.expectNothingSent();
  });

  test("turning before Apply gives a crop box for the turned image", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "photo.jpg");
    const tools = page.locator(".editor-tools");
    await tools.getByRole("button", {name: "Crop"}).click();
    await tools.getByRole("button", {name: "Rotate & flip"}).click();
    await page.getByRole("button", {name: "Turn right"}).click();
    await tools.getByRole("button", {name: "Crop"}).click();
    await expect(page.locator(".editor-crop-size")).toContainText(
      "Result: 1,200 × 1,600 pixels"
    );
    await page.getByRole("button", {name: "Apply crop"}).click();
    await expect(status(page)).toContainText("Result1,200 × 1,600");
    network.expectNothingSent();
  });

  test("the ratio is kept when coming back to Crop, and side handles resize", async ({
    page
  }) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "photo.jpg");
    const tools = page.locator(".editor-tools");
    await tools.getByRole("button", {name: "Crop"}).click();
    await page.getByLabel("Aspect ratio preset").selectOption("16:9");
    await tools.getByRole("button", {name: "Rotate & flip"}).click();
    await tools.getByRole("button", {name: "Crop"}).click();
    await expect(page.getByLabel("Aspect ratio preset")).toHaveValue("16:9");

    // Drag the right-hand handle 80 screen pixels to the left.
    const handle = page.locator(".editor-handle-e");
    await handle.scrollIntoViewIfNeeded();
    const at = (await handle.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x - 80, at.y + at.height / 2, {steps: 5});
    await page.mouse.up();

    const text = await page.locator(".editor-crop-size").innerText();
    const [w, h] = text.match(/[\d,]+/g)!.map(n => Number(n.replace(/,/g, "")));
    expect(w).toBeLessThan(1600);
    expect(Math.abs(h! - (w! * 9) / 16)).toBeLessThanOrEqual(1);
    network.expectNothingSent();
  });

  test("typing a padding size is one Undo step", async ({page}) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "photo.jpg");
    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Border & padding"})
      .click();
    const padding = page.getByLabel("Padding (px)");
    await padding.fill("");
    await padding.pressSequentially("120");
    await expect(status(page)).toContainText("Result1,840 × 1,440");
    await padding.press("Tab");
    await page.getByRole("button", {name: "Undo"}).click();
    await expect(status(page)).toContainText("Result1,600 × 1,200");
    await expect(page.getByRole("button", {name: "Undo"})).toBeDisabled();
    network.expectNothingSent();
  });

  test("too-big padding is refused, so nothing changes", async ({page}) => {
    await openTool(page, "image-editor");
    const network = watchNetwork(page);
    await openImage(page, "photo.jpg");
    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Border & padding"})
      .click();
    const padding = page.getByLabel("Padding (px)");
    await padding.fill("20000");
    await expect(page.locator(".editor-panel")).toContainText(
      "nothing was changed"
    );
    await padding.press("Tab");
    await expect(status(page)).toContainText("Result1,600 × 1,200");
    await expect(page.getByRole("button", {name: "Undo"})).toBeDisabled();
    network.expectNothingSent();
  });
});
