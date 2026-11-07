import {canSaveWebp} from "../../../shared/images/canvas";
import {compress, CompressRequest} from "../../../shared/images/compress";
import {zipFiles} from "../../../shared/files/zip";
import {serve} from "../../../shared/worker/serve";

export type {
  CompressRequest,
  CompressSettings
} from "../../../shared/images/compress";

const handlers = {
  canSaveWebp: () => canSaveWebp(),

  compress: (request: CompressRequest) => compress(request),

  zip: (files: {name: string; blob: Blob}[]) => zipFiles(files)
};

export type SmartImageCompressorApi = typeof handlers;

serve(handlers);
