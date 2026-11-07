import {zipSync} from "fflate";

/* Packs files into one ZIP. Images are already compressed, so files are
   stored as they are (fast, and no bigger). Runs in a worker. */
export async function zipFiles(
  files: readonly {name: string; blob: Blob}[]
): Promise<Blob> {
  const entries: Record<string, [Uint8Array, {level: 0}]> = {};
  for (const file of files) {
    entries[file.name] = [
      new Uint8Array(await file.blob.arrayBuffer()),
      {level: 0}
    ];
  }
  return new Blob([zipSync(entries)], {type: "application/zip"});
}
