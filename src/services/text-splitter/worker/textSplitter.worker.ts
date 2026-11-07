import {csvBlob, textBlob} from "../../../shared/files/download";
import {toDelimited} from "../../../shared/tabular/delimited";
import {readSourceCached, Source} from "../../../shared/tabular/source";
import {writeWorkbook} from "../../../shared/tabular/xlsx";
import {serve} from "../../../shared/worker/serve";
import {buildTable, SplitOptions} from "../logic/split";

const PREVIEW_ROWS = 100;

export interface SplitRequest {
  source: Source;
  separator: string;
  options: SplitOptions;
  maxRows: number;
}

async function split({source, separator, options, maxRows}: SplitRequest) {
  const loaded = await readSourceCached(source, {split: separator, maxRows});
  const sheet = loaded.sheets[0];
  return {
    table: buildTable(sheet ? sheet.rows : [], options),
    notice: loaded.notice
  };
}

const handlers = {
  async run(request: SplitRequest) {
    const {table, notice} = await split(request);
    return {
      notice,
      header: table.header,
      previewRows: table.rows.slice(0, PREVIEW_ROWS),
      rowCount: table.rows.length,
      columnCount: table.header.length,
      // Tab-separated, so pasting into Excel or Sheets fills the columns.
      copyText: textBlob(toDelimited([table.header, ...table.rows], "\t"))
    };
  },

  async export(request: SplitRequest & {format: "csv" | "txt" | "xlsx"}) {
    const {table} = await split(request);
    const rows = [table.header, ...table.rows];
    switch (request.format) {
      case "csv":
        return csvBlob(toDelimited(rows, ","));
      case "txt":
        return textBlob(toDelimited(rows, "\t"));
      case "xlsx":
        return writeWorkbook([{name: "Split text", rows}]);
    }
  }
};

export type TextSplitterApi = typeof handlers;

serve(handlers);
