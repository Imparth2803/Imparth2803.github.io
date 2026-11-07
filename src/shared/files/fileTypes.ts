/* File types the tools accept, described in plain words for messages. */
export const FILE_TYPES = {
  text: {extensions: ["txt"], label: "text (.txt)"},
  csv: {extensions: ["csv", "tsv"], label: "CSV (.csv)"},
  excel: {
    extensions: ["xlsx", "xls", "xlsm", "ods"],
    label: "Excel (.xlsx, .xls)"
  }
} as const;

export type FileKind = keyof typeof FILE_TYPES;

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isSpreadsheetFile(name: string): boolean {
  return (FILE_TYPES.excel.extensions as readonly string[]).includes(
    fileExtension(name)
  );
}

export function acceptedExtensions(kinds: readonly FileKind[]): string[] {
  return kinds.flatMap(kind => [...FILE_TYPES[kind].extensions]);
}

export function describeKinds(kinds: readonly FileKind[]): string {
  const labels = kinds.map(kind => FILE_TYPES[kind].label);
  return labels.length > 1
    ? `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`
    : labels[0] ?? "";
}
