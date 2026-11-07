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
import {
  compareLists,
  CompareOptions,
  CompareResult,
  RESULT_TITLES,
  ResultKey
} from "../logic/compare";

const PREVIEW = 100;

const KEYS = Object.keys(RESULT_TITLES) as ResultKey[];

export interface CompareRequest {
  a: ColumnPick;
  b: ColumnPick;
  options: CompareOptions;
}

async function compare({a, b, options}: CompareRequest) {
  const [listA, listB] = await Promise.all([readColumn(a), readColumn(b)]);
  return compareLists(listA, listB, options);
}

/* Rows for one result, with a heading row. */
function resultRows(result: CompareResult, key: ResultKey): string[][] {
  if (key === "repeatedA" || key === "repeatedB") {
    return [
      ["Value", "Times"],
      ...result[key].map(r => [r.value, String(r.count)])
    ];
  }
  return [["Value"], ...result[key].map(value => [value])];
}

function summaryRows(r: CompareResult): string[][] {
  return [
    ["", "List A", "List B"],
    ["Entries", String(r.totalA), String(r.totalB)],
    ["Empty entries (not compared)", String(r.blankA), String(r.blankB)],
    ["Different values", String(r.uniqueA), String(r.uniqueB)],
    ["In both lists", String(r.both.length), String(r.both.length)],
    ["Only in this list", String(r.onlyA.length), String(r.onlyB.length)],
    [
      "Values repeated in this list",
      String(r.repeatedA.length),
      String(r.repeatedB.length)
    ]
  ];
}

const handlers = {
  inspect: (p: {source: Source; read: ReadOptions}) =>
    inspectSource(p.source, p.read),

  async run(request: CompareRequest) {
    const r = await compare(request);
    const lists = {} as Record<
      ResultKey,
      {count: number; preview: string[][]; text: Blob}
    >;
    for (const key of KEYS) {
      const rows = resultRows(r, key).slice(1);
      lists[key] = {
        count: rows.length,
        preview: rows.slice(0, PREVIEW),
        text: textBlob(rows.map(row => row.join("\t")).join("\n"))
      };
    }
    return {
      totals: {
        totalA: r.totalA,
        totalB: r.totalB,
        blankA: r.blankA,
        blankB: r.blankB,
        uniqueA: r.uniqueA,
        uniqueB: r.uniqueB
      },
      lists
    };
  },

  async export(
    request: CompareRequest & {what: ResultKey | "all"; format: "csv" | "xlsx"}
  ) {
    const r = await compare(request);
    if (request.what === "all") {
      return writeWorkbook([
        {name: "Summary", rows: summaryRows(r)},
        ...KEYS.map(key => ({
          name: RESULT_TITLES[key],
          rows: resultRows(r, key)
        }))
      ]);
    }
    const rows = resultRows(r, request.what);
    return request.format === "csv"
      ? csvBlob(toDelimited(rows, ","))
      : writeWorkbook([{name: RESULT_TITLES[request.what], rows}]);
  }
};

export type TwoListComparatorApi = typeof handlers;

serve(handlers);
