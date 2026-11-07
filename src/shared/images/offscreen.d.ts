/* TypeScript 4.9's built-in types (with both the "dom" and "webworker"
   libraries loaded) leave out OffscreenCanvas.convertToBlob, which every
   browser this site supports has. */
interface ImageEncodeOptions {
  type?: string;
  quality?: number;
}

interface OffscreenCanvas {
  convertToBlob(options?: ImageEncodeOptions): Promise<Blob>;
}
