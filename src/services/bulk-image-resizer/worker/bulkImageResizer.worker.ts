import {canSaveWebp} from "../../../shared/images/canvas";
import {resize, ResizeRequest} from "../../../shared/images/resize";
import {zipFiles} from "../../../shared/files/zip";
import {serve} from "../../../shared/worker/serve";

export type {
  ResizeRequest,
  ResizeSettings
} from "../../../shared/images/resize";

const handlers = {
  canSaveWebp: () => canSaveWebp(),

  resize: (request: ResizeRequest) => resize(request),

  zip: (files: {name: string; blob: Blob}[]) => zipFiles(files)
};

export type BulkImageResizerApi = typeof handlers;

serve(handlers);
