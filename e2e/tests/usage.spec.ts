import {expect, Page, test} from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {fixture, openFile} from "./helpers";

/* Usage records: what is sent, when, and what is never sent. Supabase's
   replies are stubbed. The other test files keep recording off. */

type Row = {
  page_session: string;
  tool: string;
  action: string;
  details: Record<string, unknown>;
  occurred_at: string;
};

const signedIn = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "auth", "signed-in.json"), "utf8")
);
const recordingOn = {
  cookies: [],
  origins: signedIn.origins.map((origin: {localStorage: {name: string}[]}) => ({
    ...origin,
    localStorage: origin.localStorage.filter(
      item => item.name !== "office-tools-usage"
    )
  }))
};
test.use({storageState: recordingOn});

const SECRET = "Confidential-Customer-Zoltan";

/* Records every batch sent to usage_events. */
async function stubUsage(page: Page) {
  const batches: {rows: Row[]; raw: string; auth: string}[] = [];
  await page.route("**/rest/v1/usage_events", route => {
    const raw = route.request().postData() ?? "";
    batches.push({
      rows: JSON.parse(raw),
      raw,
      auth: route.request().headers()["authorization"] ?? ""
    });
    return route.fulfill({status: 201, body: ""});
  });
  return batches;
}

/* A real paste event (Playwright's fill() doesn't fire one). */
async function pasteInto(page: Page, selector: string, text: string) {
  await page.locator(selector).fill(text);
  await page.locator(selector).evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    el.dispatchEvent(
      new ClipboardEvent("paste", {clipboardData: data, bubbles: true})
    );
  }, text);
}

const actions = (rows: Row[]) => rows.map(row => row.action);

test("records what was done, and sends it only on leaving the tool", async ({
  page,
  browserName
}) => {
  const batches = await stubUsage(page);
  await page.goto("/services/list-cleaner");
  await pasteInto(page, "#cleaner-input-text", `${SECRET}\nBeta\nbeta\n`);
  await page.getByRole("button", {name: "Clean list"}).click();
  await expect(page.locator(".tool-preview-text, table").first()).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", {name: "Excel (.xlsx)"}).click()
  ]);
  await download.path();
  // Nothing goes while the tool is in use.
  await page.waitForTimeout(500);
  expect(batches).toHaveLength(0);

  await page.getByRole("link", {name: "← All tools"}).click();
  await expect.poll(() => batches.length).toBe(1);
  const {rows, raw, auth} = batches[0]!;
  expect(auth).toBe("Bearer e2e-access-token");
  expect(actions(rows)).toEqual(
    expect.arrayContaining(["open", "task", "download"])
  );
  expect(actions(rows)[0]).toBe("open");
  for (const row of rows) {
    expect(row.tool).toBe("list-cleaner");
    expect(row.page_session).toBe(rows[0]!.page_session);
    expect(Date.parse(row.occurred_at)).not.toBeNaN();
  }
  // Firefox drops the text from a simulated paste event (real pastes keep
  // it), so the paste record is only checked in the other browsers.
  if (browserName !== "firefox") {
    expect(rows.find(r => r.action === "text_pasted")?.details).toEqual({
      length: "under_1k"
    });
  }
  expect(rows.find(r => r.action === "download")!.details).toEqual({
    format: "xlsx",
    size: "under_100kb"
  });
  const task = rows.find(r => r.action === "task")!.details;
  expect(task.outcome).toBe("ok");
  expect(typeof task.ms).toBe("number");
  // What was pasted never leaves the page.
  expect(raw).not.toContain(SECRET);
  expect(raw.toLowerCase()).not.toContain("beta");
});

test("records a picked file's type and size, never its name", async ({
  page
}) => {
  const batches = await stubUsage(page);
  await page.goto("/services/list-cleaner");
  await openFile(page, "cleaner-input", fixture("with-bom.csv"));
  await page.getByRole("link", {name: "← All tools"}).click();
  await expect.poll(() => batches.length).toBe(1);
  const added = batches[0]!.rows.find(r => r.action === "files_added");
  expect(added?.details).toEqual({
    count: 1,
    type: "csv",
    size: "under_100kb",
    via: "picker"
  });
  expect(batches[0]!.raw).not.toContain("with-bom");
});

test("records dropped files and finished batches", async ({page}) => {
  const batches = await stubUsage(page);
  await page.goto("/services/bulk-image-resizer");
  const png = fs.readFileSync(fixture("screenshot.png")).toString("base64");
  await page.locator(".tool-drop").evaluate((zone, base64) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(
      new File([bytes], "Holiday Zoltan.png", {type: "image/png"})
    );
    data.items.add(new File([bytes], "second.png", {type: "image/png"}));
    zone.dispatchEvent(
      new DragEvent("drop", {dataTransfer: data, bubbles: true})
    );
  }, png);
  await page.getByRole("button", {name: "Resize images"}).click();
  await expect(page.locator(".tool-image-card", {hasText: "→"})).toHaveCount(2);
  await page.getByRole("link", {name: "← All tools"}).click();
  await expect.poll(() => batches.length).toBe(1);
  const added = batches[0]!.rows.find(r => r.action === "files_added");
  expect(added?.details).toMatchObject({count: 2, type: "png", via: "drop"});
  const batch = batches[0]!.rows.find(r => r.action === "batch");
  expect(batch?.details).toMatchObject({items: 2, done: 2, failed: 0});
  expect(batches[0]!.raw).not.toContain("Zoltan");
});

test("counts files opened in the Image Editor", async ({page}) => {
  const batches = await stubUsage(page);
  await page.goto("/services/image-editor");
  await page.locator("#editor-files").setInputFiles(fixture("screenshot.png"));
  await expect(page.locator(".editor canvas").first()).toBeVisible();
  await page.getByRole("link", {name: "← All tools"}).click();
  await expect.poll(() => batches.length).toBe(1);
  const added = batches[0]!.rows.find(r => r.action === "files_added");
  expect(added?.details).toMatchObject({count: 1, type: "png", via: "picker"});
  expect(batches[0]!.raw).not.toContain("screenshot");
});

test("switching to another tab sends what's waiting", async ({page}) => {
  const batches = await stubUsage(page);
  await page.goto("/services/text-splitter");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => batches.length).toBe(1);
  expect(actions(batches[0]!.rows)).toEqual(["open"]);
});

test("signing out sends what's waiting first", async ({page}) => {
  const batches = await stubUsage(page);
  await page.route("**/auth/v1/logout**", route =>
    route.fulfill({status: 204})
  );
  await page.goto("/services/text-splitter");
  await page.getByRole("button", {name: "Sign out"}).click();
  await expect.poll(() => batches.length).toBe(1);
  expect(batches[0]!.auth).toBe("Bearer e2e-access-token");
});

test("turning recording off on /privacy stops it", async ({page}) => {
  const batches = await stubUsage(page);
  await page.goto("/privacy");
  const choice = page.getByRole("checkbox", {name: /Record my usage/});
  await expect(choice).toBeChecked();
  await choice.uncheck();
  await expect(page.getByText("Off: nothing is recorded")).toBeVisible();

  await page.goto("/services/list-cleaner");
  await pasteInto(page, "#cleaner-input-text", "a\nb");
  await page.getByRole("button", {name: "Clean list"}).click();
  await page.getByRole("link", {name: "← All tools"}).click();
  await page.waitForTimeout(500);
  expect(batches).toHaveLength(0);

  // And back on.
  await page.goto("/privacy");
  await page.getByRole("checkbox", {name: /Record my usage/}).check();
  await page.goto("/services/list-cleaner");
  await page.getByRole("link", {name: "← All tools"}).click();
  await expect.poll(() => batches.length).toBe(1);
});

test.describe("signed out", () => {
  test.use({storageState: {cookies: [], origins: []}});

  test("nothing is recorded", async ({page}) => {
    const batches = await stubUsage(page);
    await page.goto("/services/list-cleaner");
    await page.getByRole("link", {name: "← All tools"}).click();
    await page.waitForTimeout(500);
    expect(batches).toHaveLength(0);
  });
});
