import React, {useCallback, useEffect, useState} from "react";
import "../../../shared/ui/Tool.scss";
import {ENCODINGS, EncodingChoice} from "../../../shared/files/decodeText";
import {baseName, downloadBlob} from "../../../shared/files/download";
import {isSpreadsheetFile} from "../../../shared/files/fileTypes";
import type {TextLimits} from "../../../shared/limits";
import {SEPARATOR_NAMES} from "../../../shared/tabular/delimited";
import type {Source} from "../../../shared/tabular/source";
import {columnLabels} from "../../../shared/tabular/table";
import {ResultActions} from "../../../shared/ui/ResultActions";
import {
  defaultSheetChoice,
  SheetChoice,
  SourceSetup
} from "../../../shared/ui/SourceSetup";
import {SourceInput} from "../../../shared/ui/SourceInput";
import {TablePreview} from "../../../shared/ui/TablePreview";
import {
  ActionBar,
  Checkbox,
  Choice,
  Field,
  Notice,
  Summary,
  ToolStep
} from "../../../shared/ui/ToolStep";
import {useInspect} from "../../../shared/ui/useInspect";
import {useTask} from "../../../shared/ui/useTask";
import {useWorker} from "../../../shared/ui/useWorker";
import type {
  CsvConverterApi,
  OutputSettings
} from "../worker/csvConverter.worker";
import {formatCount} from "../../../shared/text/numbers";

type RunResult = Awaited<ReturnType<CsvConverterApi["run"]>>;

const createWorker = () =>
  new Worker(new URL("../worker/csvConverter.worker.ts", import.meta.url));

const SEPARATORS = [
  {value: ",", label: "Commas ( , )"},
  {value: ";", label: "Semicolons ( ; )"},
  {value: "\t", label: "Tabs"},
  {value: "|", label: "Pipes ( | )"}
];

export default function CsvConverter({limits}: {limits: TextLimits}) {
  const worker = useWorker<CsvConverterApi>(createWorker);
  const inspect = useCallback<CsvConverterApi["inspect"]>(
    p => worker.call("inspect", p),
    [worker]
  );
  const task = useTask();
  const [formKey, setFormKey] = useState(0);
  const [source, setSource] = useState<Source | null>(null);
  const [inputSeparator, setInputSeparator] = useState("auto");
  const [encoding, setEncoding] = useState<EncodingChoice>("auto");
  const isExcel =
    source?.kind === "file" && isSpreadsheetFile(source.file.name);
  const read = {split: inputSeparator, maxRows: limits.maxRows, encoding};
  const inspected = useInspect(inspect, source, read);
  const [choice, setChoice] = useState<SheetChoice>({
    sheet: 0,
    hasHeader: true
  });
  const [columns, setColumns] = useState<number[]>([]);
  const [format, setFormat] = useState<OutputSettings["format"]>(
    isExcel ? "csv" : "xlsx"
  );
  const [outputSeparator, setOutputSeparator] = useState(",");
  const [bom, setBom] = useState(true);
  const [protectFormulas, setProtectFormulas] = useState(true);
  const [result, setResult] = useState<RunResult | null>(null);

  // Excel in -> CSV out, and anything else -> Excel out, unless changed.
  useEffect(() => {
    setFormat(isExcel ? "csv" : "xlsx");
  }, [isExcel]);
  useEffect(() => {
    if (inspected.status !== "ready") return;
    setChoice({...defaultSheetChoice(inspected), hasHeader: true});
  }, [inspected]);
  const sheet =
    inspected.status === "ready"
      ? inspected.result.sheets[choice.sheet]
      : undefined;
  useEffect(() => {
    setColumns(
      sheet ? Array.from({length: sheet.columnCount}, (_, i) => i) : []
    );
  }, [sheet]);

  const output: OutputSettings = {
    format,
    separator: outputSeparator,
    bom,
    protectFormulas
  };
  const pick =
    source && inspected.status === "ready"
      ? {source, read, sheet: choice.sheet, hasHeader: choice.hasHeader}
      : null;
  const request =
    pick && columns.length > 0
      ? {pick, columns, output, sheetName: sheet?.name ?? "Sheet1"}
      : null;
  const labels = sheet
    ? columnLabels(sheet.firstRows[0], sheet.columnCount, choice.hasHeader)
    : [];

  useEffect(() => {
    setResult(null);
  }, [
    source,
    inputSeparator,
    encoding,
    choice,
    columns,
    format,
    outputSeparator,
    bom,
    protectFormulas
  ]);

  const run = () => {
    if (!request) return;
    task.run("Converting…", async () =>
      setResult(await worker.call("run", request))
    );
  };

  const download = async () => {
    if (!request) return;
    const blob = await worker.call("export", request);
    const name =
      source?.kind === "file" ? baseName(source.file.name) : "converted";
    downloadBlob(blob, `${name}.${format}`);
  };

  const reset = () => {
    worker.cancel();
    setSource(null);
    setResult(null);
    task.setError(null);
    setFormKey(k => k + 1);
  };

  const toggleColumn = (i: number, on: boolean) =>
    setColumns(current =>
      on ? [...current, i].sort((a, b) => a - b) : current.filter(c => c !== i)
    );

  const found =
    inspected.status === "ready" ? inspected.result.separator : undefined;
  const example = result?.findings.longNumberExample;

  return (
    <div className="tool">
      <ToolStep step={1} title="Add your file">
        <SourceInput
          key={formKey}
          id="csv-input"
          value={source}
          onChange={setSource}
          fileKinds={["csv", "excel", "text"]}
          limits={limits}
          pastePlaceholder={
            "Paste CSV text, for example:\nEmployee ID,Name,City\n007,Parth,Mumbai"
          }
        />
        {source && !isExcel && (
          <div className="tool-setup-row tool-setup-gap">
            <Field
              label="Columns in this file are separated by"
              hint={
                inputSeparator === "auto" && found
                  ? `Found: ${SEPARATOR_NAMES[found] ?? found}`
                  : undefined
              }
            >
              <select
                className="tool-select"
                value={inputSeparator}
                onChange={e => setInputSeparator(e.target.value)}
              >
                <option value="auto">Work it out</option>
                {SEPARATORS.map(s => (
                  <option key={s.label} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            {source.kind === "file" && (
              <Field
                label="Text encoding"
                hint="Change this if letters like é, ü or ñ look wrong below."
              >
                <select
                  className="tool-select"
                  value={encoding}
                  onChange={e => setEncoding(e.target.value as EncodingChoice)}
                >
                  {ENCODINGS.map(e => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}
        <SourceSetup state={inspected} choice={choice} onChoice={setChoice}>
          {(names, summary) => (
            <>
              <TablePreview
                header={choice.hasHeader ? names : null}
                rows={summary.firstRows.slice(choice.hasHeader ? 1 : 0)}
                totalRows={Math.max(
                  0,
                  summary.rowCount - (choice.hasHeader ? 1 : 0)
                )}
                label="The first rows, as read"
              />
              {names.length > 1 && (
                <fieldset className="tool-group">
                  <legend>Columns to keep</legend>
                  <div className="tool-inline">
                    {names.map((name, i) => (
                      <Checkbox
                        key={`${i}-${name}`}
                        label={name}
                        checked={columns.includes(i)}
                        onChange={on => toggleColumn(i, on)}
                      />
                    ))}
                  </div>
                </fieldset>
              )}
            </>
          )}
        </SourceSetup>
      </ToolStep>

      <ToolStep step={2} title="Choose what to save">
        <div className="tool-settings">
          <Choice
            label="Save as"
            value={format}
            onChange={setFormat}
            options={[
              {value: "xlsx", label: "Excel (.xlsx)"},
              {value: "csv", label: "CSV"}
            ]}
          />
          {format === "csv" ? (
            <div className="tool-group">
              <Field label="Separate columns with">
                <select
                  className="tool-select"
                  value={outputSeparator}
                  onChange={e => setOutputSeparator(e.target.value)}
                >
                  {SEPARATORS.map(s => (
                    <option key={s.label} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Checkbox
                label="Make Excel show non-English letters correctly"
                hint="Adds a small marker (a UTF-8 byte-order mark) at the start of the file. Recommended."
                checked={bom}
                onChange={setBom}
              />
              <Checkbox
                label="Stop values from running as formulas"
                hint="Values starting with = + - or @ (other than plain numbers) get a ' in front, so a spreadsheet treats them as text."
                checked={protectFormulas}
                onChange={setProtectFormulas}
              />
            </div>
          ) : (
            <p className="tool-field-hint">
              Every value is saved as text, so IDs, phone numbers and PIN codes
              keep their leading zeros and every digit.
            </p>
          )}
        </div>
      </ToolStep>

      <ToolStep step={3} title="Convert">
        <ActionBar
          label="Convert"
          busyLabel={task.busy}
          disabled={!request}
          onRun={run}
          onCancel={() => worker.cancel()}
          onReset={reset}
        />
        {!source && <p className="tool-muted">Add a file first.</p>}
        {source && inspected.status === "ready" && columns.length === 0 && (
          <p className="tool-muted">Tick at least one column to keep.</p>
        )}
        {task.error && <Notice tone="error">{task.error}</Notice>}
      </ToolStep>

      {result && (
        <ToolStep step={4} title="Result">
          <Summary
            items={[
              ["Rows", result.rowCount],
              ["Columns", columns.length]
            ]}
          />
          {result.findings.longNumbers > 0 && example && (
            <Notice tone={format === "csv" ? "warning" : "info"}>
              {formatCount(result.findings.longNumbers)}{" "}
              {result.findings.longNumbers === 1 ? "value has" : "values have"}{" "}
              more than 15 digits (for example “{example.value}” in row{" "}
              {example.row}, column “{labels[columns[example.column] ?? 0]}”).{" "}
              {format === "csv"
                ? "Excel only keeps 15 digits of a number, so it may round these when it opens this CSV. Use the Excel download to keep every digit."
                : "They're saved as text, so every digit is kept."}
            </Notice>
          )}
          {format === "csv" && result.findings.risky > 0 && (
            <Notice tone={protectFormulas ? "info" : "warning"}>
              {formatCount(result.findings.risky)}{" "}
              {result.findings.risky === 1 ? "value starts" : "values start"}{" "}
              with = + - or @.{" "}
              {protectFormulas
                ? "They were saved with a ' in front so spreadsheets treat them as text."
                : "A spreadsheet may run them as formulas when the file is opened."}
            </Notice>
          )}
          {format === "csv" && (
            <p className="tool-muted">
              Opening a CSV by double-clicking it lets Excel remove leading
              zeros (007 becomes 7). The file itself keeps them; to see them in
              Excel, use the Excel download instead.
            </p>
          )}
          <TablePreview
            header={result.header}
            rows={result.previewRows}
            totalRows={result.rowCount}
            label="Preview of the converted data"
          />
          <ResultActions
            run={task.run}
            downloads={[
              {
                label:
                  format === "csv" ? "Download CSV" : "Download Excel (.xlsx)",
                run: download
              }
            ]}
          />
        </ToolStep>
      )}
    </div>
  );
}
