import {expect, Page, test} from "@playwright/test";
import {PDFDict, PDFDocument, PDFName} from "pdf-lib";
import {fixture, openTool, saveDownload, watchNetwork} from "./helpers";

/* Each fixture page has its own width (600 + page number for
   five-pages.pdf, 700 + page number for two-pages.pdf), so the saved file
   shows which page went where. five-pages.pdf's page 2 is already turned
   90° in the file. */
async function pagesOf(bytes: Buffer) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map(page => ({
    width: Math.round(page.getWidth()),
    turn: page.getRotation().angle
  }));
}

async function addPdfs(page: Page, files: string[], pageCount: number) {
  await page.locator("#pdf-input-files").setInputFiles(files.map(fixture));
  await expect(page.locator(".pdf-count")).toHaveText(`${pageCount} pages`);
}

const card = (page: Page, position: number) =>
  page.locator(".pdf-page", {
    has: page.locator(".pdf-page-number", {
      hasText: new RegExp(`^Page ${position} of`)
    })
  });
const saveAll = (page: Page) =>
  saveDownload(page, () =>
    page.getByRole("button", {name: "Save PDF"}).click()
  );

test.describe("PDF Page Organizer", () => {
  test("rearranges, removes and turns pages; the saved PDF follows the new order and keeps text as text", async ({
    page
  }) => {
    await openTool(page, "pdf-page-organizer");
    const network = watchNetwork(page);
    await addPdfs(page, ["five-pages.pdf"], 5);
    // Previews are drawn.
    await expect(page.locator(".pdf-page-thumb img")).toHaveCount(5);

    await page.getByRole("button", {name: "Remove page 4"}).click();
    await page.getByRole("button", {name: "Move page 3 left"}).click();
    // Keyboard focus stays with the moved page.
    await expect(
      page.getByRole("button", {name: "Move page 2 left"})
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByRole("button", {name: "Turn page 4 clockwise"}).click();
    await expect(page.locator(".pdf-order")).toContainText(
      "five-pages.pdf pages 3, 1–2, 5 (turned 90°)"
    );

    const out = await saveAll(page);
    expect(out.name).toBe("five-pages-organized.pdf");
    expect(await pagesOf(out.bytes)).toEqual([
      {width: 603, turn: 0},
      {width: 601, turn: 0},
      {width: 602, turn: 90},
      {width: 605, turn: 90}
    ]);
    // Pages are copied, not turned into pictures.
    const doc = await PDFDocument.load(out.bytes);
    const resources = doc.getPage(0).node.Resources()!;
    expect(resources.lookup(PDFName.of("Font"))).toBeDefined();
    expect(
      resources.lookupMaybe(PDFName.of("XObject"), PDFDict)?.keys() ?? []
    ).toEqual([]);
    await expect(page.locator(".tool-notice-success")).toContainText("4 pages");
    network.expectNothingSent();
  });

  test("combines PDFs, duplicates and saves selected pages, and can undo", async ({
    page
  }) => {
    await openTool(page, "pdf-page-organizer");
    await addPdfs(page, ["five-pages.pdf", "two-pages.pdf"], 7);
    await expect(card(page, 6)).toContainText("two-pages.pdf, page 1");

    await page
      .getByRole("checkbox", {name: "Select page 1", exact: true})
      .click();
    await page
      .getByRole("checkbox", {name: "Select page 3", exact: true})
      .click({modifiers: ["Shift"]});
    await page
      .getByRole("checkbox", {name: "Select page 7", exact: true})
      .click();
    await expect(page.locator(".pdf-count")).toHaveText(
      "4 of 7 pages selected"
    );
    await page.getByRole("button", {name: "Duplicate"}).click();
    await expect(page.locator(".pdf-count")).toHaveText(
      "4 of 11 pages selected"
    );

    const selected = await saveDownload(page, () =>
      page
        .getByRole("button", {name: "Save selected pages as a new PDF"})
        .click()
    );
    expect(selected.name).toBe("combined-selected-pages.pdf");
    expect((await pagesOf(selected.bytes)).map(p => p.width)).toEqual([
      601, 602, 603, 702
    ]);

    const all = await saveAll(page);
    expect(all.name).toBe("combined-organized.pdf");
    expect((await pagesOf(all.bytes)).map(p => p.width)).toEqual([
      601, 601, 602, 602, 603, 603, 604, 605, 701, 702, 702
    ]);

    await page.getByRole("button", {name: "Undo"}).click();
    await expect(page.locator(".pdf-count")).toHaveText(
      "4 of 7 pages selected"
    );

    // Move the selection to the end.
    await page.getByLabel("Move to position").fill("4");
    await page.getByRole("button", {name: "Move", exact: true}).click();
    await expect(page.locator(".pdf-order")).toContainText(
      "five-pages.pdf pages 4–5"
    );
    expect(
      (await pagesOf((await saveAll(page)).bytes)).map(p => p.width)
    ).toEqual([604, 605, 701, 601, 602, 603, 702]);

    // Removing a file removes its pages.
    await page.getByRole("button", {name: "Remove two-pages.pdf"}).click();
    await expect(page.locator(".pdf-count")).toHaveText(
      "3 of 5 pages selected"
    );
  });

  test("moves pages by dragging", async ({page}) => {
    await openTool(page, "pdf-page-organizer");
    await addPdfs(page, ["five-pages.pdf"], 5);
    await card(page, 5).dragTo(card(page, 1), {targetPosition: {x: 8, y: 60}});
    await expect(page.locator(".pdf-order")).toContainText(
      "five-pages.pdf pages 5, 1–4"
    );
    expect(
      (await pagesOf((await saveAll(page)).bytes)).map(p => p.width)
    ).toEqual([605, 601, 602, 603, 604]);
  });

  test("refuses locked, damaged and non-PDF files, saying what to do", async ({
    page
  }) => {
    await openTool(page, "pdf-page-organizer");
    await page
      .locator("#pdf-input-files")
      .setInputFiles(
        ["locked.pdf", "damaged.pdf", "not-a-pdf.pdf", "two-pages.pdf"].map(
          fixture
        )
      );
    await expect(page.locator(".pdf-count")).toHaveText("2 pages");
    const problems = page.getByRole("alert");
    await expect(problems).toContainText(
      "“locked.pdf” is protected with a password or locked against changes"
    );
    await expect(problems).toContainText("“Save as PDF”");
    await expect(problems).toContainText("“damaged.pdf” couldn't be read");
    await expect(problems).toContainText("“not-a-pdf.pdf” isn't a PDF file.");
  });
});
