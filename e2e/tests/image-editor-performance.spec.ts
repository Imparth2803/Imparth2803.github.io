import {expect, Page, test} from "@playwright/test";
import {openTool} from "./helpers";

/* Timing test for the Stage 4 tools on a 24-megapixel photo: dragging a
   colour slider and adding effects must never freeze the page for more
   than 100 ms (all the pixel work happens in the background worker).
   Like performance.spec.ts, this runs on its own after the other tests. */
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
