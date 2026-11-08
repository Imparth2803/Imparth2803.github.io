/* Usage records: what people do in the tools (opened, added files,
   downloaded…), never what they work on. Shared code calls track(); the
   platform decides where records go (src/platform/usage), and nothing is
   recorded until it connects a sink (only for signed-in people who haven't
   turned recording off).

   Only numbers, true/false and short fixed words may be recorded. Never pass
   file names, text, error messages or anything a person typed or opened. */

export type UsageDetails = Record<string, number | boolean | string>;
type Sink = (action: string, details: UsageDetails) => void;

let sink: Sink | null = null;

export function setUsageSink(next: Sink | null): void {
  sink = next;
}

export function track(action: string, details: UsageDetails = {}): void {
  try {
    sink?.(action, details);
  } catch {
    // Recording must never break a tool.
  }
}

/** A rough size, e.g. "1_10mb", so exact file sizes aren't kept. */
export function sizeBand(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return "under_100kb";
  if (mb < 1) return "100kb_1mb";
  if (mb < 10) return "1_10mb";
  if (mb < 100) return "10_100mb";
  return "over_100mb";
}

/** A rough length for pasted text. */
export function lengthBand(chars: number): string {
  if (chars < 1000) return "under_1k";
  if (chars < 100000) return "1k_100k";
  return "over_100k";
}

/** The file's type from its extension ("Report.PDF" -> "pdf"), or "other".
    Only the extension is looked at; the name is never kept. */
export function fileType(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "other";
}

/** One type for a group of files: their shared type, or "mixed". */
export function filesType(files: readonly {name: string}[]): string {
  const types = new Set(files.map(file => fileType(file.name)));
  return types.size === 1 ? Array.from(types)[0]! : "mixed";
}
