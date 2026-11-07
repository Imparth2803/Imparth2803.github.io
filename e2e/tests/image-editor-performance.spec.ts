import {expect, Page, test} from "@playwright/test";
import {openTool} from "./helpers";

/* Timing tests for the editor's heavier tools: dragging a colour slider
   and adding effects on a 24-megapixel photo, and a collage of nine large
   photos, must never freeze the page for more than 100 ms (all the pixel
   work happens in the background worker). They run on their own, after
   the other timing tests (see playwright.config.ts). */
test.describe.configure({mode: "serial"});

const TARGET_MS = 100;

/** The longest gap in a 10 ms timer while `work` runs (a freeze). */
async function longestFreeze(page: Page, work: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as {__freeze: number; __tick: number};
    let last = performance.now();
    w.__freeze = 0;
    w.__tick = window.setInterval(() => {
      const now = performance.now();
      w.__freeze = Math.max(w.__freeze, now - last - 10);
      last = now;
    }, 10);
  });
  await work();
  await page.waitForTimeout(50);
  return page.evaluate(() => {
    const w = window as unknown as {__freeze: number; __tick: number};
    clearInterval(w.__tick);
    return w.__freeze;
  });
}

test("Image Editor: colour and effects on a 24-megapixel photo", async ({
  page
}) => {
  await openTool(page, "image-editor");
  const bytes = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(6000, 4000);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `hsl(${i * 37} 70% 50%)`;
      ctx.fillRect((i * 151) % 6000, (i * 97) % 4000, 600, 400);
    }
    const blob = await canvas.convertToBlob({type: "image/jpeg", quality: 0.9});
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator("#editor-files").setInputFiles({
    name: "big.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(bytes)
  });
  await expect(page.locator(".editor-status")).toContainText("6,000 × 4,000", {
    timeout: 30_000
  });
  await page
    .locator(".editor-tools")
    .getByRole("button", {name: "Colour adjust"})
    .click();

  const slider = page.locator("#adjust-brightness");
  await slider.scrollIntoViewIfNeeded();
  const at = (await slider.boundingBox())!;
  const y = at.y + at.height / 2;

  const freeze = await longestFreeze(page, async () => {
    await page.mouse.move(at.x + at.width / 2, y);
    await page.mouse.down();
    for (let i = 0; i <= 20; i++) {
      await page.mouse.move(at.x + at.width * (0.5 + i / 50), y);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page
      .locator(".editor-tools")
      .getByRole("button", {name: "Effects"})
      .click();
    const blur = page.getByLabel("Blur, as a number", {exact: true});
    await blur.fill("8");
    await blur.press("Enter");
    await expect(page.locator(".editor-status")).toContainText("StatusReady", {
      timeout: 30_000
    });
    await page.getByRole("button", {name: "Save", exact: true}).first().click();
    await expect(
      page.locator(".editor-panel").getByRole("button", {name: /^Download/})
    ).toBeEnabled({timeout: 60_000});
  });
  console.log(
    `Image Editor (Stage 4), 24 megapixels: longest freeze ${freeze.toFixed(
      0
    )} ms`
  );
  expect(freeze).toBeLessThan(TARGET_MS);
});

test("Image Editor: a 3 × 3 collage of nine 4000 × 4000 photos", async ({
  page
}) => {
  test.slow();
  await openTool(page, "image-editor");
  const photos = await page.evaluate(async () => {
    const out: number[][] = [];
    for (let n = 0; n < 9; n++) {
      const canvas = new OffscreenCanvas(4000, 4000);
      const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = `hsl(${(i * 37 + n * 40) % 360} 70% 50%)`;
        ctx.fillRect((i * 331) % 4000, (i * 197) % 4000, 700, 500);
      }
      const blob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: 0.85
      });
      out.push(Array.from(new Uint8Array(await blob.arrayBuffer())));
      canvas.width = canvas.height = 0;
    }
    return out;
  });
  await page.getByRole("button", {name: "Make a collage"}).click();

  // Handing the nine files to the page is the test tool's own work (it
  // copies about 9 MB into the page at once), so timing starts after it.
  await page.locator("#collage-files").setInputFiles(
    photos.map((bytes, i) => ({
      name: `photo-${i + 1}.jpg`,
      mimeType: "image/jpeg",
      buffer: Buffer.from(bytes)
    }))
  );
  const freeze = await longestFreeze(page, async () => {
    await expect(page.locator(".editor-collage-card")).toHaveCount(9, {
      timeout: 60_000
    });
    await page.getByLabel("Layout").selectOption("grid3");
    await expect(page.locator(".editor-collage-preview")).toContainText(
      "2,000 × 2,000 pixels"
    );
    await page.getByRole("button", {name: "Save the collage"}).click();
    await page.getByLabel("File type").selectOption("png");
    await expect(
      page.locator(".editor-panel").getByRole("button", {name: "Download PNG"})
    ).toBeEnabled({timeout: 120_000});
  });
  console.log(
    `Image Editor collage, nine 16-megapixel photos: longest freeze ${freeze.toFixed(
      0
    )} ms`
  );
  expect(freeze).toBeLessThan(TARGET_MS);
});
