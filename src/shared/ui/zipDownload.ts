import {downloadBlob} from "../files/download";
import {isSmallDevice} from "../limits";
import {uniqueNames} from "../images/names";
import {ToolError} from "../worker/WorkerClient";

/* A ZIP is built in memory, so very large batches are refused with a
   clear next step instead of crashing the tab. */
const MAX_ZIP_MB = 500;
const MAX_ZIP_MB_SMALL = 150;

export async function downloadZip(
  files: readonly {name: string; blob: Blob}[],
  zipName: string,
  zip: (files: {name: string; blob: Blob}[]) => Promise<Blob>
): Promise<void> {
  const totalMB =
    files.reduce((sum, f) => sum + f.blob.size, 0) / (1024 * 1024);
  const limit = isSmallDevice() ? MAX_ZIP_MB_SMALL : MAX_ZIP_MB;
  if (totalMB > limit) {
    throw new ToolError(
      `These files add up to ${totalMB.toFixed(
        0
      )} MB, which is too much to put in one ZIP on this device (up to ${limit} MB). Download them one by one, or in smaller batches.`
    );
  }
  const names = uniqueNames(files.map(f => f.name));
  const blob = await zip(
    files.map((f, i) => ({name: names[i]!, blob: f.blob}))
  );
  downloadBlob(blob, zipName);
}
