import fs from "fs";
import path from "path";
import {PDFDict, PDFDocument, PDFName} from "pdf-lib";
import {UserError} from "../../../shared/text/userError";
import {buildPdf, LOCKED_MESSAGE, readPdf} from "../logic/build";

const fixture = (name: string) =>
  new Uint8Array(
    fs.readFileSync(path.join(__dirname, "../../../../e2e/fixtures", name))
  );

// Each fixture page has its own width (600 + page number, 700 + page number).
const widths = (doc: PDFDocument) =>
  doc.getPages().map(page => Math.round(page.getWidth()));

describe("reading PDFs", () => {
  it("reads a PDF and counts its pages", async () => {
    expect(
      (await readPdf(fixture("five-pages.pdf"), "a.pdf")).getPageCount()
    ).toBe(5);
  });

  it("refuses locked, damaged and non-PDF files with a plain reason", async () => {
    await expect(readPdf(fixture("locked.pdf"), "locked.pdf")).rejects.toThrow(
      `“locked.pdf” ${LOCKED_MESSAGE}`
    );
    await expect(
      readPdf(fixture("damaged.pdf"), "damaged.pdf")
    ).rejects.toBeInstanceOf(UserError);
    await expect(
      readPdf(fixture("not-a-pdf.pdf"), "notes.pdf")
    ).rejects.toThrow("“notes.pdf” isn't a PDF file.");
  });
});

describe("building the new PDF", () => {
  it("puts pages in the new order, turns them, and keeps them as text", async () => {
    const a = await readPdf(fixture("five-pages.pdf"), "a.pdf");
    const b = await readPdf(fixture("two-pages.pdf"), "b.pdf");
    const bytes = await buildPdf(
      new Map([
        [1, a],
        [2, b]
      ]),
      [
        {source: 1, index: 2, turn: 0},
        {source: 2, index: 1, turn: 90},
        {source: 1, index: 0, turn: 0},
        {source: 1, index: 1, turn: 270} // already turned 90° in the file
      ]
    );
    const out = await PDFDocument.load(bytes);
    expect(widths(out)).toEqual([603, 702, 601, 602]);
    expect(out.getPages().map(p => p.getRotation().angle)).toEqual([
      0, 90, 0, 0
    ]);
    // Copied, not pictured: the page uses a font and has no images.
    const resources = out.getPage(0).node.Resources()!;
    expect(resources.lookup(PDFName.of("Font"))).toBeDefined();
    const pictures = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
    expect(pictures?.keys() ?? []).toEqual([]);
  });

  it("makes a copied page a separate page in the file", async () => {
    const a = await readPdf(fixture("five-pages.pdf"), "a.pdf");
    const bytes = await buildPdf(new Map([[1, a]]), [
      {source: 1, index: 0, turn: 0},
      {source: 1, index: 0, turn: 90}
    ]);
    const out = await PDFDocument.load(bytes);
    const [first, second] = out.getPages();
    expect(first!.ref).not.toBe(second!.ref);
    expect(first!.ref.toString()).not.toEqual(second!.ref.toString());
    expect([first!.getRotation().angle, second!.getRotation().angle]).toEqual([
      0, 90
    ]);
    expect(out.getTitle()).toBe("Test document");
  });
});
