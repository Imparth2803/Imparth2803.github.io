import {textBlob} from "../../../shared/files/download";
import {
  inspectSource,
  readRows,
  SheetPick
} from "../../../shared/tabular/inspect";
import type {ReadOptions, Source} from "../../../shared/tabular/source";
import {UserError} from "../../../shared/text/userError";
import {serve} from "../../../shared/worker/serve";
import {combine, CombineOptions} from "../logic/combine";

const PREVIEW_CHARS = 20000;

export interface CombineRequest {
  pick: SheetPick;
  options: CombineOptions;
}

const handlers = {
  inspect: (p: {source: Source; read: ReadOptions}) =>
    inspectSource(p.source, p.read),

  async run(request: CombineRequest) {
    if (request.options.columns.length === 0) {
      throw new UserError("Choose at least one column to combine.");
    }
    const rows = await readRows(request.pick);
    const result = combine(rows, request.options);
    return {
      preview: result.text.slice(0, PREVIEW_CHARS),
      length: result.text.length,
      valueCount: result.valueCount,
      rowsUsed: result.rowsUsed,
      skippedBlank: result.skippedBlank,
      skippedDuplicate: result.skippedDuplicate,
      text: textBlob(result.text)
    };
  }
};

export type ColumnCombinerApi = typeof handlers;

serve(handlers);
