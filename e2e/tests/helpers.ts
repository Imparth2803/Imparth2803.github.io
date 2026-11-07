import {expect, Page, Download} from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

export const fixture = (name: string) =>
  path.join(__dirname, "..", "fixtures", name);

/* Records every request from now on. The tools may load their own code
   (same-site /static/ files); anything else would mean data leaving. */
export function watchNetwork(page: Page) {
  const requests: string[] = [];
  page.on("request", request => {
    requests.push(`${request.method()} ${request.url()}`);
  });
  return {
    expectNothingSent() {
      const origin = new URL(page.url()).origin;
      const unexpected = requests.filter(
        r =>
          !(
            r.startsWith(`GET ${origin}/static/`) ||
            r.startsWith("GET blob:") ||
            r.startsWith("GET data:")
          )
      );
      expect(unexpected, "requests made while processing").toEqual([]);
    }
  };
}

export async function openTool(page: Page, slug: string) {
  await page.goto(`/services/${slug}`);
  // Every tool's page has a .tool (numbered steps) or .editor root.
  await expect(page.locator(".tool, .editor").first()).toBeVisible();
}

export async function saveDownload(
  page: Page,
  click: () => Promise<void>
): Promise<{name: string; bytes: Buffer}> {
  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent("download"),
    click()
  ]);
  const file = await download.path();
  return {name: download.suggestedFilename(), bytes: fs.readFileSync(file!)};
}

export function sheetsOf(bytes: Buffer): Record<string, string[][]> {
  const book = XLSX.read(bytes, {type: "buffer"});
  const out: Record<string, string[][]> = {};
  for (const name of book.SheetNames) {
    out[name] = XLSX.utils.sheet_to_json<string[]>(book.Sheets[name]!, {
      header: 1,
      raw: false,
      defval: ""
    });
  }
  return out;
}

/* Switches an input box to "Open a file" and picks the file. */
export async function openFile(page: Page, inputId: string, file: string) {
  await page
    .locator(`#${inputId}`)
    .getByRole("button", {name: "Open a file"})
    .click();
  await page.locator(`#${inputId}-file`).setInputFiles(file);
}

export async function paste(page: Page, inputId: string, text: string) {
  await page.locator(`#${inputId}-text`).fill(text);
}

/* Longest time the page was frozen while `work` ran: a timer ticks every
   10 ms, and the longest gap between ticks (minus the 10 ms) is how long
   the page couldn't respond. Works in every browser. */
export async function longestBlock(
  page: Page,
  work: () => Promise<void>
): Promise<number> {
  await page.evaluate(() => {
    const w = window as unknown as {__longest: number; __timer: number};
    let last = performance.now();
    w.__longest = 0;
    w.__timer = window.setInterval(() => {
      const now = performance.now();
      w.__longest = Math.max(w.__longest, now - last - 10);
      last = now;
    }, 10);
  });
  await work();
  await page.waitForTimeout(50);
  return page.evaluate(() => {
    const w = window as unknown as {__longest: number; __timer: number};
    clearInterval(w.__timer);
    return w.__longest;
  });
}

/* Decodes an image file in the page and returns its size and the colours
   at the given points (as [r, g, b, a]). */
export async function pixels(
  page: Page,
  bytes: Buffer,
  points: [number, number][]
) {
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
