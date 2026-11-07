import {degrees, PDFDocument} from "pdf-lib";
import {UserError} from "../../../shared/text/userError";

/* Reads PDFs and builds the new one with pdf-lib. Pages are copied as
   they are (text, pictures, links and all), never turned into images. */

export const LOCKED_MESSAGE =
  "is protected with a password or locked against changes, so its pages can't be rearranged here. If you can open it, use your PDF reader's Print option and choose “Save as PDF” to make an unlocked copy, then add that copy. Or ask the sender for an unlocked version.";

const DAMAGED_MESSAGE =
  "couldn't be read. It may be damaged, or not really a PDF. Try opening it in a PDF reader and saving it again.";

function looksLikePdf(bytes: Uint8Array): boolean {
  // "%PDF-" near the start (some files have a little junk before it).
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

export async function readPdf(
  bytes: Uint8Array,
  name: string
): Promise<PDFDocument> {
  if (!looksLikePdf(bytes)) {
    throw new UserError(`“${name}” isn't a PDF file.`);
  }
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, {updateMetadata: false});
  } catch (error) {
    // pdf-lib's EncryptedPDFError doesn't work with instanceof (it is
    // compiled for old browsers), so its message is checked instead.
    if (error instanceof Error && /is encrypted/.test(error.message)) {
      throw new UserError(`“${name}” ${LOCKED_MESSAGE}`);
    }
    if (error instanceof RangeError) throw error; // out of memory
    throw new UserError(`“${name}” ${DAMAGED_MESSAGE}`);
  }
  let count: number;
  try {
    count = doc.getPageCount();
  } catch {
    throw new UserError(`“${name}” ${DAMAGED_MESSAGE}`);
  }
  if (count === 0) {
    throw new UserError(`“${name}” has no pages.`);
  }
  return doc;
}

export interface OutputPage {
  source: number;
  index: number;
  /** Extra turn clockwise. */
  turn: number;
}

/** Builds a PDF from pages of the given documents, in the given order. */
export async function buildPdf(
  docs: ReadonlyMap<number, PDFDocument>,
  pages: readonly OutputPage[]
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const only = docs.size === 1 ? Array.from(docs.values())[0]! : null;
  const title = only?.getTitle();
  if (title) out.setTitle(title);

  /* A page copied twice must be two separate pages in the file, so each
     copy of the same page goes in a separate round (pdf-lib reuses what it
     already copied within one round). */
  const seen = new Map<string, number>();
  const rounds = pages.map(page => {
    const id = `${page.source}:${page.index}`;
    const round = seen.get(id) ?? 0;
    seen.set(id, round + 1);
    return round;
  });

  const copied: (ReturnType<PDFDocument["getPage"]> | null)[] = pages.map(
    () => null
  );
  const roundCount = Math.max(0, ...rounds.map(r => r + 1));
  for (let round = 0; round < roundCount; round++) {
    for (const [source, doc] of Array.from(docs)) {
      const wanted = pages
        .map((page, at) => ({page, at}))
        .filter(({page, at}) => page.source === source && rounds[at] === round);
      if (wanted.length === 0) continue;
      const result = await out.copyPages(
        doc,
        wanted.map(({page}) => page.index)
      );
      wanted.forEach(({at}, n) => {
        copied[at] = result[n]!;
      });
    }
  }

  pages.forEach((page, at) => {
    const copy = copied[at]!;
    if (page.turn) {
      const angle = (copy.getRotation().angle + page.turn) % 360;
      copy.setRotation(degrees((angle + 360) % 360));
    }
    out.addPage(copy);
  });
  return out.save();
}
