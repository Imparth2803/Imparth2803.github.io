/* Recreates the PDF test files in this folder.
   Run: node e2e/fixtures/make-pdf-fixtures.js

   Each page of five-pages.pdf and two-pages.pdf has its own width
   (600 + page number, or 700 + page number), so a test can tell from the
   saved file which page ended up where. */
const fs = require("fs");
const path = require("path");
const {PDFDocument, StandardFonts, rgb, degrees, PDFName} = require("pdf-lib");

const dir = __dirname;
const COLOURS = [
  rgb(0.85, 0.2, 0.2),
  rgb(0.2, 0.6, 0.25),
  rgb(0.2, 0.35, 0.85),
  rgb(0.9, 0.7, 0.1),
  rgb(0.6, 0.25, 0.7)
];

async function textPages(widthBase, labels, {rotateSecond = false} = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle("Test document");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  labels.forEach((label, i) => {
    const page = doc.addPage([widthBase + i + 1, 792]);
    page.drawRectangle({
      x: 40,
      y: 560,
      width: 200,
      height: 160,
      color: COLOURS[i % COLOURS.length]
    });
    page.drawText(label, {x: 40, y: 480, size: 48, font});
    page.drawText("Searchable text stays text.", {
      x: 40,
      y: 420,
      size: 14,
      font
    });
    if (rotateSecond && i === 1) page.setRotation(degrees(90));
  });
  return doc.save();
}

async function bigPdf(pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Report page ${i + 1}`, {x: 50, y: 720, size: 28, font});
    for (let line = 0; line < 40; line++) {
      page.drawText(
        `Line ${line + 1}: quarterly figures, totals and notes for page ${
          i + 1
        }.`,
        {x: 50, y: 680 - line * 15, size: 10, font}
      );
    }
    for (let bar = 0; bar < 12; bar++) {
      page.drawRectangle({
        x: 50 + bar * 40,
        y: 40,
        width: 30,
        height: 20 + ((i * 7 + bar * 13) % 60),
        color: COLOURS[bar % COLOURS.length]
      });
    }
  }
  return doc.save();
}

/* A PDF that says it is encrypted (an /Encrypt entry in its trailer), like
   one protected with a password or locked against changes. */
async function lockedPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const encrypt = doc.context.obj({
    Filter: PDFName.of("Standard"),
    V: 1,
    R: 2,
    P: -44
  });
  doc.context.trailerInfo.Encrypt = doc.context.register(encrypt);
  return doc.save({useObjectStreams: false});
}

async function main() {
  const write = (name, bytes) =>
    fs.writeFileSync(path.join(dir, name), Buffer.from(bytes));
  write(
    "five-pages.pdf",
    await textPages(600, ["Page 1", "Page 2", "Page 3", "Page 4", "Page 5"], {
      rotateSecond: true
    })
  );
  write("two-pages.pdf", await textPages(700, ["Extra A", "Extra B"]));
  write("big-400-pages.pdf", await bigPdf(400));
  write("locked.pdf", await lockedPdf());
  write(
    "damaged.pdf",
    Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 9 0 R >>\n%%junk")
  );
  write("not-a-pdf.pdf", Buffer.from("This is a text file, not a PDF.\n"));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
