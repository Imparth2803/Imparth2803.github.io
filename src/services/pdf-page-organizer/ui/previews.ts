import {
  getDocument,
  PDFWorker,
  type PDFDocumentProxy
} from "pdfjs-dist/legacy/build/pdf.mjs";

/* Small page pictures for the screen only, drawn with pdf.js. The saved
   PDF never uses them: it is built from the original pages.

   Memory stays under control: a picture is only drawn for a page that is
   on (or near) the screen, one at a time; pages scrolled away before
   their turn are skipped. Once more than MAX_KEPT pictures are held, the
   ones no page is showing are thrown away (and drawn again if needed). */

/** Longest side of a picture, in pixels. */
const SIZE = 240;
const MAX_KEPT = 240;

export type Preview = {url: string} | "failed" | null;
type Listener = (preview: Preview) => void;

const keyOf = (source: number, index: number) => `${source}:${index}`;

export class PdfPreviews {
  /* pdf.js reads the files in its own background worker. (It doesn't stop
     a worker it was given, so dispose() does.) */
  private readonly port = new Worker(
    new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url)
  );
  // pdf.js's types wrongly say `port` must be null; it takes a Worker.
  private readonly worker = new PDFWorker({port: this.port as unknown as null});
  private readonly docs = new Map<number, Promise<PDFDocumentProxy>>();
  /** Drawn pictures, oldest first. */
  private readonly done = new Map<string, Preview>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private queue: {source: number; index: number}[] = [];
  /** The page being drawn now, if any. */
  private drawing: string | null = null;
  private closed = false;

  open(source: number, file: File): void {
    const loading = file.arrayBuffer().then(
      data =>
        getDocument({
          data,
          worker: this.worker,
          isEvalSupported: false,
          enableXfa: false,
          stopAtErrors: false
        }).promise
    );
    loading.catch(() => undefined); // Reported per page as "failed".
    this.docs.set(source, loading);
  }

  close(source: number): void {
    void this.docs.get(source)?.then(
      doc => doc.destroy(),
      () => undefined
    );
    this.docs.delete(source);
    this.queue = this.queue.filter(job => job.source !== source);
    Array.from(this.done.keys()).forEach(key => {
      if (key.startsWith(`${source}:`)) this.forget(key);
    });
  }

  /** Calls `listener` with the picture of a page (straight away if it is
      ready). Returns a function to call when the page is off screen. */
  watch(source: number, index: number, listener: Listener): () => void {
    const key = keyOf(source, index);
    let set = this.listeners.get(key);
    if (!set) this.listeners.set(key, (set = new Set()));
    set.add(listener);
    const ready = this.done.get(key);
    if (ready) {
      // Mark as recently used.
      this.done.delete(key);
      this.done.set(key, ready);
      listener(ready);
    } else if (
      this.drawing !== key &&
      !this.queue.some(job => job.source === source && job.index === index)
    ) {
      this.queue.push({source, index});
      void this.drawNext();
    }
    return () => {
      set!.delete(listener);
      if (set!.size === 0) {
        this.listeners.delete(key);
        this.queue = this.queue.filter(
          job => job.source !== source || job.index !== index
        );
      }
    };
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    Array.from(this.docs.keys()).forEach(source => this.close(source));
    this.worker.destroy();
    this.port.terminate();
  }

  private async drawNext(): Promise<void> {
    if (this.drawing !== null || this.closed) return;
    const job = this.queue.shift();
    if (!job) return;
    const key = keyOf(job.source, job.index);
    this.drawing = key;
    let preview: Preview;
    try {
      const doc = await this.docs.get(job.source);
      if (!doc) throw new Error("Closed");
      preview = {url: await draw(doc, job.index)};
    } catch {
      preview = "failed";
    }
    this.drawing = null;
    if (this.closed || !this.docs.has(job.source)) {
      if (preview !== "failed") URL.revokeObjectURL(preview.url);
    } else {
      this.done.set(key, preview);
      this.listeners.get(key)?.forEach(listener => listener(preview));
      this.trim();
    }
    void this.drawNext();
  }

  private trim(): void {
    if (this.done.size <= MAX_KEPT) return;
    for (const key of Array.from(this.done.keys())) {
      if (this.done.size <= MAX_KEPT) break;
      if (!this.listeners.has(key)) this.forget(key);
    }
  }

  private forget(key: string): void {
    const preview = this.done.get(key);
    if (preview && preview !== "failed") URL.revokeObjectURL(preview.url);
    this.done.delete(key);
  }
}

async function draw(doc: PDFDocumentProxy, index: number): Promise<string> {
  const page = await doc.getPage(index + 1);
  try {
    const natural = page.getViewport({scale: 1});
    const scale = Math.min(SIZE / natural.width, SIZE / natural.height);
    const viewport = page.getViewport({scale});
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d", {alpha: false})!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({canvasContext: ctx, viewport}).promise;
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("No picture");
    return URL.createObjectURL(blob);
  } finally {
    page.cleanup();
  }
}
