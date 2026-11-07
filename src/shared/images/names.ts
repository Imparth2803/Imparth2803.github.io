/* "holiday.png" + "jpg" -> "holiday.jpg"; with a suffix: "holiday-small.jpg". */
export function outputName(original: string, ext: string, suffix = ""): string {
  const dot = original.lastIndexOf(".");
  const base = (dot > 0 ? original.slice(0, dot) : original) || "image";
  return `${base}${suffix}.${ext}`;
}

/* Makes names unique for a ZIP: photo.jpg, photo (2).jpg, photo (3).jpg.
   Compares ignoring case, as Windows and macOS do. */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map(name => {
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++)
      candidate = `${base} (${n})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
