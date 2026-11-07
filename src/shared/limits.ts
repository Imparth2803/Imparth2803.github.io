/* How much one tool accepts, so large inputs fail with a clear message
   instead of freezing or crashing the page. Phones and tablets get lower
   limits because they have less memory. */

export interface FileLimits {
  /** Largest file, in megabytes, on computers. */
  maxFileMB: number;
  /** Largest file on phones and tablets. */
  maxFileMBMobile: number;
}

/** Limits for tools that work on text, lists and spreadsheets. */
export interface TextLimits extends FileLimits {
  kind: "text";
  /** Most rows (or lines) in one input. */
  maxRows: number;
}

/** Limits for tools that work on batches of images. */
export interface ImageLimits extends FileLimits {
  kind: "images";
  /** Most images in one batch. */
  maxFiles: number;
  maxFilesMobile: number;
  /** Largest image, in megapixels (width × height ÷ 1,000,000). */
  maxMegapixels: number;
  maxMegapixelsMobile: number;
}

/** Limits for tools that work on PDF files. */
export interface PdfLimits extends FileLimits {
  kind: "pdf";
  /** Most PDFs open at once (to combine them). */
  maxFiles: number;
  maxFilesMobile: number;
  /** Most megabytes of PDFs open at once, all files together. */
  maxTotalMB: number;
  maxTotalMBMobile: number;
  /** Most pages, all files together. */
  maxPages: number;
  maxPagesMobile: number;
}

/** Limits for the image editor: one image at a time, edited in several
    steps, so it holds about three full-size copies in memory. */
export interface EditorLimits extends FileLimits {
  kind: "editor";
  maxMegapixels: number;
  maxMegapixelsMobile: number;
}

export type ServiceLimits = TextLimits | ImageLimits | PdfLimits | EditorLimits;

export function isSmallDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches &&
    Math.min(window.screen.width, window.screen.height) < 820
  );
}

export function fileLimitMB(limits: FileLimits): number {
  return isSmallDevice() ? limits.maxFileMBMobile : limits.maxFileMB;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
