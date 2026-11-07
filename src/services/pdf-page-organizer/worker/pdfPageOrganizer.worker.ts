import type {PDFDocument} from "pdf-lib";
import {serve} from "../../../shared/worker/serve";
import {buildPdf, OutputPage, readPdf} from "../logic/build";

async function load(file: File): Promise<PDFDocument> {
  return readPdf(new Uint8Array(await file.arrayBuffer()), file.name);
}

const handlers = {
  /** Checks a PDF can be read and changed, and counts its pages. */
  async inspect(file: File) {
    const doc = await load(file);
    return {pageCount: doc.getPageCount()};
  },

  /** Builds the new PDF. Only the files that are used are read. */
  async build({
    sources,
    pages
  }: {
    sources: {id: number; file: File}[];
    pages: OutputPage[];
  }) {
    const used = new Set(pages.map(page => page.source));
    const docs = new Map<number, PDFDocument>();
    for (const {id, file} of sources) {
      if (used.has(id)) docs.set(id, await load(file));
    }
    const bytes = await buildPdf(docs, pages);
    return new Blob([bytes], {type: "application/pdf"});
  }
};

export type PdfPageOrganizerApi = typeof handlers;

serve(handlers);
