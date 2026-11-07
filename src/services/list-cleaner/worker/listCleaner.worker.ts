import {csvBlob, textBlob} from "../../../shared/files/download";
import {toDelimited} from "../../../shared/tabular/delimited";
import {
  ColumnPick,
  inspectSource,
  readColumn
} from "../../../shared/tabular/inspect";
import type {ReadOptions, Source} from "../../../shared/tabular/source";
import {writeWorkbook} from "../../../shared/tabular/xlsx";
import {serve} from "../../../shared/worker/serve";
import {cleanList, CleanOptions, RemovalReason} from "../logic/cleanList";

const PREVIEW = 100;

export interface CleanRequest {
  pick: ColumnPick;
  options: CleanOptions;
}

async function clean({pick, options}: CleanRequest) {
  const values = await readColumn(pick);
  return {values, result: cleanList(values, options)};
}

const handlers = {
  inspect: (p: {source: Source; read: ReadOptions}) =>
    inspectSource(p.source, p.read),

  async run(request: CleanRequest) {
    const {values, result} = await clean(request);
    const byReason: Partial<Record<RemovalReason, number>> = {};
    for (const r of result.removed)
      byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
    return {
      before: values.length,
      after: result.kept.length,
      keptPreview: result.kept.slice(0, PREVIEW),
      removedPreview: result.removed.slice(0, PREVIEW),
      removedCount: result.removed.length,
      byReason,
      text: textBlob(result.kept.join("\n"))
    };
  },

  async export(
    request: CleanRequest & {format: "csv" | "xlsx"; columnName: string}
  ) {
    const {result} = await clean(request);
    const rows = [[request.columnName], ...result.kept.map(value => [value])];
    return request.format === "csv"
      ? csvBlob(toDelimited(rows, ","))
      : writeWorkbook([{name: "Cleaned list", rows}]);
  }
};

export type ListCleanerApi = typeof handlers;

serve(handlers);
