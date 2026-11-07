/* Saves a file to the person's device. The temporary link is released
   straight after the download starts. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Firefox needs the URL to live until the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Copies text held in a Blob. Must be called straight from a click so the
   browser allows it; the Blob is passed without waiting first. */
export async function copyBlobText(blob: Blob): Promise<void> {
  const plain = new Blob([blob], {type: "text/plain"});
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({"text/plain": plain})
      ]);
      return;
    } catch {
      // Fall through: some browsers only allow writeText.
    }
  }
  await navigator.clipboard.writeText(await plain.text());
}

/* "orders.csv" -> "orders"; used to name downloads after the input file. */
export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return (dot > 0 ? fileName.slice(0, dot) : fileName) || "result";
}

const MIME = {
  csv: "text/csv;charset=utf-8",
  txt: "text/plain;charset=utf-8"
} as const;

/* CSV with a byte-order mark, so Excel shows non-English letters correctly. */
export function csvBlob(text: string): Blob {
  return new Blob(["\uFEFF", text], {type: MIME.csv});
}

export function textBlob(text: string): Blob {
  return new Blob([text], {type: MIME.txt});
}
