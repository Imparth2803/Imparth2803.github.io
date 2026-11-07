import {csvBlob} from "../../../shared/files/download";
import {toDelimited} from "../../../shared/tabular/delimited";
import {
  inspectSource,
  readTable,
  SheetPick
} from "../../../shared/tabular/inspect";
import type {ReadOptions, Source} from "../../../shared/tabular/source";
import {writeWorkbook} from "../../../shared/tabular/xlsx";
import {serve} from "../../../shared/worker/serve";
import {inspectValues, pickColumns, protect} from "../logic/convert";

const PREVIEW = 100;

export interface OutputSettings {
  format: "xlsx" | "csv";
  separator: string;
  bom: boolean;
  protectFormulas: boolean;
}

export interface ConvertRequest {
  pick: SheetPick;
  columns: number[];
  output: OutputSettings;
  sheetName: string;
}

async function convert({pick, columns, output}: ConvertRequest) {
  const table = await readTable(pick);
  const header = table.header ? pickColumns([table.header], columns)[0]! : null;
  let rows = pickColumns(table.rows, columns);
  const findings = inspectValues(rows);
  // Excel files store every value as text, so nothing can run as a formula.
  if (output.format === "csv" && output.protectFormulas) {
    rows = rows.map(row => row.map(protect));
  }
  return {header, rows, findings};
}

const handlers = {
  inspect: (p: {source: Source; read: ReadOptions}) =>
    inspectSource(p.source, p.read),

  async run(request: ConvertRequest) {
    const {header, rows, findings} = await convert(request);
    return {
      header,
      previewRows: rows.slice(0, PREVIEW),
      rowCount: rows.length,
      findings
    };
  },

  async export(request: ConvertRequest) {
    const {header, rows} = await convert(request);
    const all = header ? [header, ...rows] : rows;
    if (request.output.format === "xlsx") {
      return writeWorkbook([{name: request.sheetName, rows: all}]);
    }
    const text = toDelimited(all, request.output.separator);
    return request.output.bom
      ? csvBlob(text)
      : new Blob([text], {type: "text/csv;charset=utf-8"});
  }
};

export type CsvConverterApi = typeof handlers;

serve(handlers);
