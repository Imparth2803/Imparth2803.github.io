import {expect, Page, test} from "@playwright/test";
import {fixture, openTool, pixels, saveDownload, watchNetwork} from "./helpers";

/* Stage 6: Resize in the editor, and "Make the file smaller" in Save,
   using the same code as the Bulk Image Resizer and Smart Image Compressor. */

const status = (page: Page) => page.locator(".editor-status");
const panel = (page: Page) => page.locator(".editor-panel");

async function open(page: Page, name = "photo.jpg") {
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

async function save(page: Page, format: "jpeg" | "png", squeeze?: string) {
  await page.getByRole("button", {name: "Save", exact: true}).first().click();
  await page.getByLabel("File type").selectOption(format);
  if (squeeze)
    await page.getByLabel("Make the file smaller").selectOption(squeeze);
  const label = format === "jpeg" ? "JPG" : "PNG";
  const button = panel(page).getByRole("button", {name: `Download ${label}`});
  await expect(button).toBeEnabled({timeout: 30_000});
  return saveDownload(page, () => button.click());
}

test.describe("Image Editor — Stage 6", () => {
  test("crop, then resize to 800 px wide, gives exactly that size", async ({
    page
  }) => {
    const network = await open(page);
    await useTool(page, "Crop");
    await page.getByLabel("Aspect ratio preset").selectOption("16:9");
    await page.getByRole("button", {name: "Apply crop"}).click();
    await useTool(page, "Resize");
    await page.getByLabel("New size").selectOption("custom");
    await page.getByLabel("Width (pixels)").fill("800");
    await page.getByLabel("Height (pixels)").fill("");
    await page.getByLabel("Height (pixels)").press("Enter");
    await expect(status(page)).toContainText("Result800 × 450");
    const out = await save(page, "png");
    const {width, height} = await pixels(page, out.bytes, [[0, 0]]);
    expect([width, height]).toEqual([800, 450]);
    network.expectNothingSent();
  });

  test("Contain to a square pads the picture; JPG fills it with the background", async ({
    page
  }) => {
    const network = await open(page);
    await useTool(page, "Resize");
    await page.getByLabel("New size").selectOption("500x500");
    await expect(status(page)).toContainText("Result500 × 500");
    await page.getByRole("button", {name: "Cover", exact: true}).click();
    await expect(panel(page)).toContainText(
      "Cropped: some of the edges are cut off"
    );
    await page.getByRole("button", {name: "Contain", exact: true}).click();

    const png = await save(page, "png");
    // 1600 × 1200 into 500 × 500: the picture is 500 × 375, from y 62.
    const p = await pixels(page, png.bytes, [
      [250, 20],
      [250, 250]
    ]);
    expect(p.colours[0]![3]).toBe(0);
    expect(p.colours[1]![3]).toBe(255);

    await page.getByLabel("File type").selectOption("jpeg");
    await expect(panel(page)).toContainText("JPG can't be see-through");
    network.expectNothingSent();
  });

  test("typing a new size is one Undo step", async ({page}) => {
    const network = await open(page);
    await useTool(page, "Resize");
    await page.getByLabel("New size").selectOption("custom");
    const width = page.getByLabel("Width (pixels)");
    await width.fill("");
    await width.pressSequentially("640");
    await expect(status(page)).toContainText("Result640 × 480");
    await width.press("Tab");
    // Choosing "Custom" filled in the width once (one step), typing is another.
    await page.getByRole("button", {name: "Undo"}).click();
    await page.getByRole("button", {name: "Undo"}).click();
    await expect(status(page)).toContainText("Result1,600 × 1,200");
    await expect(page.getByRole("button", {name: "Undo"})).toBeDisabled();
    network.expectNothingSent();
  });

  test("Small makes a smaller JPG than High", async ({page}) => {
    const network = await open(page);
    const high = await save(page, "jpeg", "high");
    const small = await save(page, "jpeg", "small");
    expect(small.bytes.length).toBeLessThan(high.bytes.length);
    // Both open.
    for (const f of [high, small]) {
      const {width} = await pixels(page, f.bytes, [[0, 0]]);
      expect(width).toBe(1600);
    }
    network.expectNothingSent();
  });

  test("a PNG with Balanced uses fewer colours, is smaller, and opens", async ({
    page
  }) => {
    const network = await open(page, "screenshot.png");
    const plain = await save(page, "png");
    const balanced = await save(page, "png", "balanced");
    await expect(panel(page)).toContainText("Colours were reduced to 256");
    expect(balanced.bytes.length).toBeLessThan(plain.bytes.length);
    const {width, height} = await pixels(page, balanced.bytes, [[10, 10]]);
    expect([width, height]).toEqual([900, 600]);
    network.expectNothingSent();
  });

  test("aiming for a size is never over it unless it says so", async ({
    page
  }) => {
    const network = await open(page);
    await page.getByRole("button", {name: "Save", exact: true}).first().click();
    await page.getByLabel("File type").selectOption("jpeg");
    await page.getByLabel("Make the file smaller").selectOption("target");
    const kb = page.getByLabel("Aim for (KB)");
    await kb.fill("150");
    const button = panel(page).getByRole("button", {name: "Download JPG"});
    await expect(button).toBeEnabled({timeout: 30_000});
    await expect(panel(page)).toContainText("Aimed for 150 KB, got");
    const fits = await saveDownload(page, () => button.click());
    expect(fits.bytes.length).toBeLessThanOrEqual(150 * 1024);

    // Far too small for this detailed photo at full size: it says so, and
    // offers to make the picture smaller.
    await kb.fill("8");
    await expect(button).toBeEnabled({timeout: 30_000});
    await expect(panel(page)).toContainText("which is over your target");
    const over = await saveDownload(page, () => button.click());
    expect(over.bytes.length).toBeGreaterThan(8 * 1024);

    await panel(page)
      .getByRole("button", {
        name: "Allow making the picture smaller to reach the size"
      })
      .click();
    await expect(button).toBeEnabled({timeout: 60_000});
    await expect(panel(page)).toContainText("Made smaller to reach the target");
    const shrunk = await saveDownload(page, () => button.click());
    expect(shrunk.bytes.length).toBeLessThanOrEqual(8 * 1024);
    const {width} = await pixels(page, shrunk.bytes, [[0, 0]]);
    expect(width).toBeLessThan(1600);
    network.expectNothingSent();
  });

  test("a size target leaves room for kept camera details", async ({page}) => {
    const network = await open(page, "editor-gps.jpg");
    await page.getByRole("button", {name: "Save", exact: true}).first().click();
    await page.getByLabel("File type").selectOption("jpeg");
    await page.getByLabel("Keep camera details (without location)").check();
    await page.getByLabel("Make the file smaller").selectOption("target");
    await page.getByLabel("Aim for (KB)").fill("2");
    const button = panel(page).getByRole("button", {name: "Download JPG"});
    await expect(button).toBeEnabled({timeout: 30_000});
    const out = await saveDownload(page, () => button.click());
    expect(out.bytes.length).toBeLessThanOrEqual(2 * 1024);
    expect(Buffer.from(out.bytes).toString("latin1")).toContain("T-1000");
    network.expectNothingSent();
  });
});
