import {expect, Page, test} from "@playwright/test";
import {fixture, longestBlock, openTool} from "./helpers";

/* Timing tests: does the page stay responsive (no freeze over 50 ms) while
   large inputs are processed? These run on their own, after all the other
   tests (see playwright.config.ts), so other tests can't slow them down. */
test.describe.configure({mode: "serial"});

const TARGET_MS = 50;

const rows = 100_000;
const bigCsv = ["Employee ID,Name"]
  .concat(
    Array.from(
      {length: rows},
      (_, i) => `${String(i % 60000).padStart(6, "0")},Person ${i}`
    )
  )
  .join("\n");

async function openBigFile(
  page: Page,
  inputId: string,
  name: string,
  content: string
) {
  await page
    .locator(`#${inputId}`)
    .getByRole("button", {name: "Open a file"})
    .click();
  await page.locator(`#${inputId}-file`).setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(content)
  });
}

function report(label: string, ms: number) {
  console.log(`${label}: longest freeze ${ms.toFixed(0)} ms`);
  expect(ms).toBeLessThan(TARGET_MS);
}

test("the freeze measurement notices a 120 ms freeze", async ({page}) => {
  await page.goto("/services");
  const blocked = await longestBlock(page, async () => {
    await page.evaluate(() => {
      const end = performance.now() + 120;
      while (performance.now() < end) {
        // busy on purpose
      }
    });
    await page.waitForTimeout(200);
  });
  expect(blocked).toBeGreaterThanOrEqual(100);
});

test("List Cleaner: 100,000 rows", async ({page}) => {
  await openTool(page, "list-cleaner");
  await openBigFile(page, "cleaner-input", "big.csv", bigCsv);
  await expect(page.getByText("100,000 rows")).toBeVisible({timeout: 20_000});
  const blocked = await longestBlock(page, async () => {
    await page.getByRole("button", {name: "Clean list"}).click();
    await expect(page.locator(".tool-summary")).toContainText("After60,000", {
      timeout: 20_000
    });
  });
  report("List Cleaner, 100,000 rows", blocked);
});

test("Two-List Comparator: 100,000 rows in each list", async ({page}) => {
  await openTool(page, "two-list-comparator");
  await openBigFile(page, "list-a", "a.csv", bigCsv);
  await openBigFile(page, "list-b", "b.csv", bigCsv);
  await expect(page.getByText("100,000 rows")).toHaveCount(2, {
    timeout: 20_000
  });
  const blocked = await longestBlock(page, async () => {
    await page.getByRole("button", {name: "Compare lists"}).click();
    await expect(page.locator(".tool-summary")).toContainText("In both60,000", {
      timeout: 20_000
    });
  });
  report("Two-List Comparator, 100,000 rows", blocked);
});

test("Smart Date & Time Formatter: 100,000 dates", async ({page}) => {
  const dates = Array.from(
    {length: rows},
    (_, i) => `${(i % 28) + 1} Nov 2026 ${i % 24}:30`
  ).join("\n");
  await openTool(page, "date-time-formatter");
  await openBigFile(page, "dates-input", "dates.txt", dates);
  await expect(page.getByText("100,000 rows")).toBeVisible({timeout: 20_000});
  const blocked = await longestBlock(page, async () => {
    await page.getByRole("button", {name: "Convert dates"}).click();
    await expect(page.locator(".tool-summary")).toContainText(
      "Converted100,000",
      {timeout: 30_000}
    );
  });
  report("Date Formatter, 100,000 rows", blocked);
});

test("CSV Converter: 100,000 rows", async ({page}) => {
  const csv = ["ID;Name;Joined"]
    .concat(
      Array.from(
        {length: rows},
        (_, i) => `${String(i).padStart(7, "0")};Person ${i};2026-01-01`
      )
    )
    .join("\n");
  await openTool(page, "csv-converter");
  await openBigFile(page, "csv-input", "big.csv", csv);
  await expect(page.getByText("100,000 rows, 3 columns")).toBeVisible({
    timeout: 20_000
  });
  const blocked = await longestBlock(page, async () => {
    await page.getByRole("button", {name: "Convert", exact: true}).click();
    await expect(page.locator(".tool-summary")).toContainText("Rows100,000", {
      timeout: 20_000
    });
  });
  report("CSV Converter, 100,000 rows", blocked);
});

test("Bulk Image Resizer: 24 photos", async ({page}) => {
  await openTool(page, "bulk-image-resizer");
  await page
    .locator("#resizer-input-files")
    .setInputFiles(Array.from({length: 24}, () => fixture("photo.jpg")));
  await expect(page.getByText("24 images added")).toBeVisible();
  const blocked = await longestBlock(page, async () => {
    await page.getByRole("button", {name: "Resize images"}).click();
    await expect(page.locator(".tool-summary")).toContainText("Resized24", {
      timeout: 60_000
    });
  });
  report("Bulk Image Resizer, 24 photos", blocked);
});

test("Smart Image Compressor: 24 photos", async ({page}) => {
  await openTool(page, "smart-image-compressor");
  await page
    .locator("#compressor-input-files")
    .setInputFiles(Array.from({length: 24}, () => fixture("photo.jpg")));
  await expect(page.getByText("24 images added")).toBeVisible();
  const blocked = await longestBlock(page, async () => {
    await page.getByRole("button", {name: "Compress images"}).click();
    await expect(page.locator(".tool-summary")).toContainText("Compressed24", {
      timeout: 60_000
    });
  });
  report("Smart Image Compressor, 24 photos", blocked);
});

test("PDF Page Organizer: a 400-page PDF", async ({page}) => {
  await openTool(page, "pdf-page-organizer");
  const blocked = await longestBlock(page, async () => {
    await page
      .locator("#pdf-input-files")
      .setInputFiles(fixture("big-400-pages.pdf"));
    await expect(page.locator(".pdf-count")).toHaveText("400 pages", {
      timeout: 30_000
    });
    // Scroll through the pages while their previews are drawn.
    for (let y = 0; y < 8; y++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(150);
    }
    await expect(page.locator(".pdf-page-thumb img").first()).toBeVisible();
  });
  // Only the pages near the screen are in the page.
  expect(await page.locator(".pdf-page").count()).toBeLessThan(80);
  report("PDF Page Organizer, 400 pages", blocked);
  const saveBlocked = await longestBlock(page, async () => {
    await page.getByRole("button", {name: "Save PDF"}).click();
    await expect(page.locator(".tool-notice-success")).toContainText(
      "400 pages",
      {timeout: 30_000}
    );
  });
  report("PDF Page Organizer, saving 400 pages", saveBlocked);
});

test("Image Editor: a 24-megapixel photo", async ({page}) => {
  await openTool(page, "image-editor");
  // Draw a 6000 × 4000 JPG in the page (no fixture this size in the repo).
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
  const blocked = await longestBlock(page, async () => {
    await page.locator("#editor-files").setInputFiles({
      name: "big.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(bytes)
    });
    await expect(page.locator(".editor-status")).toContainText(
      "6,000 × 4,000",
      {timeout: 30_000}
    );
    for (const angle of ["5", "-12", "20"]) {
      await page.getByLabel("Straighten, in degrees").fill(angle);
      await page.waitForTimeout(100);
    }
    await page.getByRole("button", {name: "Turn right"}).click();
    await page.getByRole("button", {name: "Save", exact: true}).first().click();
    await expect(
      page.locator(".editor-panel").getByRole("button", {name: /^Download/})
    ).toBeEnabled({timeout: 30_000});
  });
  report("Image Editor, 24 megapixels", blocked);
});
