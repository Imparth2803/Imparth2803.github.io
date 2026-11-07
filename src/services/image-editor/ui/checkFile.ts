import {InputType, readFileInputHeader} from "../../../shared/images/header";
import {formatBytes} from "../../../shared/limits";
import {formatCount} from "../../../shared/text/numbers";

const MB = 1024 * 1024;
export const TYPE_NAMES = "JPG, PNG, WebP, GIF, BMP or AVIF";

/* Checks a file before opening it: empty, too big, not an image this tool
   can open, or too many pixels. Returns the problem, or the file's type. */
export async function checkFile(
  file: File,
  maxMB: number,
  maxMP: number
): Promise<string | {type: InputType; width: number; height: number}> {
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > maxMB * MB) {
    return `“${file.name}” is ${formatBytes(
      file.size
    )}; this device can edit images up to ${maxMB} MB.`;
  }
  const header = await readFileInputHeader(file).catch(() => null);
  if (!header) {
    return `“${file.name}” isn't a ${TYPE_NAMES} image (or it's damaged).`;
  }
  const megapixels = (header.width * header.height) / 1e6;
  if (megapixels > maxMP) {
    return `“${file.name}” is ${formatCount(header.width)} × ${formatCount(
      header.height
    )} pixels (${megapixels.toFixed(
      0
    )} megapixels); this device can edit images up to ${maxMP} megapixels. Make it smaller with the Bulk Image Resizer first.`;
  }
  return {type: header.type, width: header.width, height: header.height};
}
