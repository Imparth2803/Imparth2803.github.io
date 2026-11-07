import {csvBlob, textBlob} from "../../../shared/files/download";
import {toDelimited} from "../../../shared/tabular/delimited";
import {
  inspectSource,
  readTable,
  SheetPick
} from "../../../shared/tabular/inspect";
import type {ReadOptions, Source} from "../../../shared/tabular/source";
import {autoColumnNames, columnCount} from "../../../shared/tabular/table";
import {writeWorkbook} from "../../../shared/tabular/xlsx";
import {serve} from "../../../shared/worker/serve";
import {
  BetweenSettings,
  convertDates,
  daysBetween,
  FormatSettings,
  Outcome
} from "../logic/convert";

const PREVIEW = 200;

export type DateJob =
  | {mode: "format"; column: number; settings: FormatSettings}
  | {
      mode: "between";
      startColumn: number;
      endColumn: number;
      settings: BetweenSettings;
    };

export interface DateRequest {
  pick: SheetPick;
  job: DateJob;
}

async function work({pick, job}: DateRequest) {
  const table = await readTable(pick);
  const cell = (row: string[], i: number) => row[i] ?? "";
  const result =
    job.mode === "format"
      ? convertDates(
          table.rows.map(row => cell(row, job.column)),
          job.settings
        )
      : daysBetween(
          table.rows.map(row => cell(row, job.startColumn)),
          table.rows.map(row => cell(row, job.endColumn)),
          job.settings
        );
  return {table, result};
}

function inputCells(row: string[], job: DateJob): string[] {
  return job.mode === "format"
    ? [row[job.column] ?? ""]
    : [row[job.startColumn] ?? "", row[job.endColumn] ?? ""];
}

const handlers = {
  inspect: (p: {source: Source; read: ReadOptions}) =>
    inspectSource(p.source, p.read),

  async run(request: DateRequest) {
    const {table, result} = await work(request);
    if (result.status !== "done") return result;
    const {job} = request;
    const rows = table.rows.map((row, i) => ({
      row,
      outcome: result.outcomes[i]!
    }));
    const previewRow = ({row, outcome}: {row: string[]; outcome: Outcome}) => ({
      cells: [...inputCells(row, job), ...outcome.values, outcome.note],
      problem: outcome.problem
    });
    const problems = rows.filter(r => r.outcome.problem);
    return {
      status: "done" as const,
      orderMessage: result.orderMessage,
      counts: {
        total: rows.length,
        converted: rows.filter(r => !r.outcome.problem && !r.outcome.empty)
          .length,
        problems: problems.length,
        empty: rows.filter(r => r.outcome.empty).length
      },
      preview: rows.slice(0, PREVIEW).map(previewRow),
      problemPreview: problems.slice(0, PREVIEW).map(previewRow),
      // The new values only, one row per line, for pasting back into a sheet.
      copyText: textBlob(
        result.outcomes.map(o => o.values.join("\t")).join("\n")
      )
    };
  },

  /* The whole sheet with the new columns added at the end. */
  async export(request: DateRequest & {format: "csv" | "xlsx"}) {
    const {table, result} = await work(request);
    if (result.status !== "done") throw new Error("Order not decided");
    const width = Math.max(columnCount(table.rows), table.header?.length ?? 0);
    const names = autoColumnNames(width).map(
      (fallback, i) => table.header?.[i]?.trim() || fallback
    );
    const pad = (row: string[]) =>
      row.concat(Array<string>(Math.max(0, width - row.length)).fill(""));
    const {job} = request;
    const added =
      job.mode === "format"
        ? [`${names[job.column]} (converted)`, "Note"]
        : ["Days between", "Working days", "Note"];
    const rows = [
      [...names, ...added],
      ...table.rows.map((row, i) => {
        const o = result.outcomes[i]!;
        return [...pad(row), ...o.values, o.note];
      })
    ];
    return request.format === "csv"
      ? csvBlob(toDelimited(rows, ","))
      : writeWorkbook([
          {
            name: job.mode === "format" ? "Converted dates" : "Days between",
            rows
          }
        ]);
  }
};

export type DateTimeFormatterApi = typeof handlers;

serve(handlers);
