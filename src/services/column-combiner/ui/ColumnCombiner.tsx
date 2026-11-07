import React, {useCallback, useEffect, useState} from "react";
import "../../../shared/ui/Tool.scss";
import {baseName, downloadBlob} from "../../../shared/files/download";
import {
  fileExtension,
  isSpreadsheetFile
} from "../../../shared/files/fileTypes";
import type {TextLimits} from "../../../shared/limits";
import type {Source, TextSplit} from "../../../shared/tabular/source";
import {ResultActions} from "../../../shared/ui/ResultActions";
import {
  defaultSheetChoice,
  SheetChoice,
  SourceSetup
} from "../../../shared/ui/SourceSetup";
import {SourceInput} from "../../../shared/ui/SourceInput";
import {TextPreview} from "../../../shared/ui/TablePreview";
import {
  ActionBar,
  Checkbox,
  Field,
  Notice,
  Summary,
  ToolStep
} from "../../../shared/ui/ToolStep";
import {useInspect} from "../../../shared/ui/useInspect";
import {useTask} from "../../../shared/ui/useTask";
import {useWorker} from "../../../shared/ui/useWorker";
import {CombineOptions, PRESETS, QuoteStyle} from "../logic/combine";
import type {ColumnCombinerApi} from "../worker/columnCombiner.worker";

type RunResult = Awaited<ReturnType<ColumnCombinerApi["run"]>>;

const createWorker = () =>
  new Worker(new URL("../worker/columnCombiner.worker.ts", import.meta.url));

const PASTE_SEPARATORS: {value: TextSplit; label: string}[] = [
  {value: "\t", label: "Tabs (copied from Excel or Google Sheets)"},
  {value: ",", label: "Commas"},
  {value: ";", label: "Semicolons"},
  {value: "|", label: "Pipes ( | )"},
  {value: "lines", label: "Nothing: one value per line"}
];

const BETWEEN_COLUMNS = [
  {value: " ", label: "A space"},
  {value: ", ", label: "A comma and space"},
  {value: " - ", label: "A dash ( - )"},
  {value: "", label: "Nothing"}
];

const BETWEEN_VALUES = [
  {value: ", ", label: "Comma and space ( , )"},
  {value: ",", label: "Comma, no space"},
  {value: "; ", label: "Semicolon ( ; )"},
  {value: " | ", label: "Pipe ( | )"},
  {value: " ", label: "Space"},
  {value: "\n", label: "New line"}
];

const QUOTES: {value: QuoteStyle; label: string}[] = [
  {value: "", label: "No quotes"},
  {value: "'", label: "'Single quotes'"},
  {value: '"', label: '"Double quotes"'}
];

/* A select with a "Something else…" option that reveals a text box. */
function SeparatorSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: {value: string; label: string}[];
  onChange: (value: string) => void;
}) {
  const known = options.some(o => o.value === value);
  const [custom, setCustom] = useState(!known);
  return (
    <div className="tool-group">
      <Field label={label}>
        <select
          className="tool-select"
          value={custom ? "custom" : value}
          onChange={e => {
            const next = e.target.value;
            setCustom(next === "custom");
            if (next !== "custom") onChange(next);
          }}
        >
          {options.map(o => (
            <option key={o.label} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="custom">Something else…</option>
        </select>
      </Field>
      {custom && (
        <Field label="Your own text">
          <input
            className="tool-input"
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        </Field>
      )}
    </div>
  );
}

function toNumber(text: string): number | null {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function ColumnCombiner({limits}: {limits: TextLimits}) {
  const worker = useWorker<ColumnCombinerApi>(createWorker);
  const inspect = useCallback<ColumnCombinerApi["inspect"]>(
    p => worker.call("inspect", p),
    [worker]
  );
  const task = useTask();
  const [formKey, setFormKey] = useState(0);
  const [source, setSource] = useState<Source | null>(null);
  const [pasteSplit, setPasteSplit] = useState<TextSplit>("\t");
  const split: TextSplit =
    source?.kind === "file" &&
    (isSpreadsheetFile(source.file.name) ||
      fileExtension(source.file.name) !== "txt")
      ? "auto"
      : pasteSplit;
  const read = {split, maxRows: limits.maxRows};
  const inspected = useInspect(inspect, source, read);

  const [choice, setChoice] = useState<SheetChoice>({
    sheet: 0,
    hasHeader: false
  });
  const [columns, setColumns] = useState<number[]>([]);
  const [betweenColumns, setBetweenColumns] = useState(" ");
  const [betweenValues, setBetweenValues] = useState(", ");
  const [quote, setQuote] = useState<QuoteStyle>("");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [skipBlank, setSkipBlank] = useState(true);
  const [unique, setUnique] = useState(false);
  const [fromRow, setFromRow] = useState("");
  const [toRow, setToRow] = useState("");
  const [presetKey, setPresetKey] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);

  // New input: start from its first sheet with every column ticked.
  useEffect(() => {
    if (inspected.status !== "ready") return;
    setChoice(defaultSheetChoice(inspected));
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

  const options: CombineOptions = {
    columns,
    betweenColumns,
    betweenValues,
    quote,
    prefix,
    suffix,
    skipBlank,
    unique,
    fromRow: toNumber(fromRow),
    toRow: toNumber(toRow)
  };
  const ready = source && inspected.status === "ready" && columns.length > 0;

  useEffect(() => {
    setResult(null);
  }, [
    source,
    split,
    choice,
    columns,
    betweenColumns,
    betweenValues,
    quote,
    prefix,
    suffix,
    skipBlank,
    unique,
    fromRow,
    toRow
  ]);

  const run = () => {
    if (!source || !ready) return;
    task.run("Combining…", async () =>
      setResult(
        await worker.call("run", {
          pick: {
            source,
            read,
            sheet: choice.sheet,
            hasHeader: choice.hasHeader
          },
          options
        })
      )
    );
  };

  const applyPreset = (id: string) => {
    const preset = PRESETS.find(p => p.id === id);
    if (!preset) return;
    setBetweenValues(preset.settings.betweenValues);
    setQuote(preset.settings.quote);
    setPrefix(preset.settings.prefix);
    setSuffix(preset.settings.suffix);
    setPresetKey(k => k + 1); // refresh the separator box's "custom" state
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

  return (
    <div className="tool">
      <ToolStep step={1} title="Add your columns">
        <SourceInput
          key={formKey}
          id="combiner-input"
          value={source}
          onChange={setSource}
          fileKinds={["excel", "csv", "text"]}
          limits={limits}
          pastePlaceholder={
            "Copy cells from Excel and paste them here, for example:\nParth\tTawde\nRahul\tSharma"
          }
        />
        {source?.kind === "text" ||
        (source?.kind === "file" &&
          fileExtension(source.file.name) === "txt") ? (
          <div className="tool-setup">
            <Field label="In this text, columns are separated by">
              <select
                className="tool-select"
                value={pasteSplit}
                onChange={e => setPasteSplit(e.target.value)}
              >
                {PASTE_SEPARATORS.map(o => (
                  <option key={o.label} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}
        <SourceSetup state={inspected} choice={choice} onChoice={setChoice}>
          {labels => (
            <fieldset className="tool-group">
              <legend>Columns to combine</legend>
              <div className="tool-inline">
                {labels.map((label, i) => (
                  <Checkbox
                    key={`${i}-${label}`}
                    label={label}
                    checked={columns.includes(i)}
                    onChange={on => toggleColumn(i, on)}
                  />
                ))}
              </div>
            </fieldset>
          )}
        </SourceSetup>
      </ToolStep>

      <ToolStep step={2} title="Choose the format">
        <div className="tool-group">
          <span className="tool-field-label">Quick formats</span>
          <div className="tool-choice">
            {PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                title={p.example}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="tool-settings" key={presetKey}>
          {columns.length > 1 && (
            <SeparatorSelect
              label="Between columns in a row"
              value={betweenColumns}
              options={BETWEEN_COLUMNS}
              onChange={setBetweenColumns}
            />
          )}
          <SeparatorSelect
            label="Between each value"
            value={betweenValues}
            options={BETWEEN_VALUES}
            onChange={setBetweenValues}
          />
          <Field label="Put each value in">
            <select
              className="tool-select"
              value={quote}
              onChange={e => setQuote(e.target.value as QuoteStyle)}
            >
              {QUOTES.map(q => (
                <option key={q.label} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="tool-settings">
          <div className="tool-inline">
            <Field label="Start with">
              <input
                className="tool-input"
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
              />
            </Field>
            <Field label="End with">
              <input
                className="tool-input"
                value={suffix}
                onChange={e => setSuffix(e.target.value)}
              />
            </Field>
          </div>
          <div className="tool-inline">
            <Field label="From row" hint="Row 1 is the first row of data">
              <input
                className="tool-input"
                inputMode="numeric"
                value={fromRow}
                placeholder="First"
                onChange={e => setFromRow(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field label="To row">
              <input
                className="tool-input"
                inputMode="numeric"
                value={toRow}
                placeholder="Last"
                onChange={e => setToRow(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          </div>
          <div className="tool-group">
            <Checkbox
              label="Leave out empty values"
              checked={skipBlank}
              onChange={setSkipBlank}
            />
            <Checkbox
              label="Leave out repeated values"
              checked={unique}
              onChange={setUnique}
            />
          </div>
        </div>
      </ToolStep>

      <ToolStep step={3} title="Combine">
        <ActionBar
          label="Combine columns"
          busyLabel={task.busy}
          disabled={!ready}
          onRun={run}
          onCancel={() => worker.cancel()}
          onReset={reset}
        />
        {!source && <p className="tool-muted">Add some columns first.</p>}
        {source && inspected.status === "ready" && columns.length === 0 && (
          <p className="tool-muted">Tick at least one column to combine.</p>
        )}
        {task.error && <Notice tone="error">{task.error}</Notice>}
      </ToolStep>

      {result && (
        <ToolStep step={4} title="Result">
          <Summary
            items={[
              ["Values", result.valueCount],
              ["Rows used", result.rowsUsed],
              ["Empty left out", result.skippedBlank],
              ["Repeats left out", result.skippedDuplicate]
            ]}
          />
          {result.valueCount === 0 && (
            <Notice tone="info">
              Nothing to combine: every chosen cell in these rows is empty.
            </Notice>
          )}
          <TextPreview
            text={result.preview}
            totalLength={result.length}
            label="Combined text"
          />
          <ResultActions
            copy={result.text}
            run={task.run}
            downloads={[
              {
                label: "Text (.txt)",
                run: () =>
                  downloadBlob(
                    result.text,
                    `${
                      source?.kind === "file"
                        ? baseName(source.file.name) + "-combined"
                        : "combined"
                    }.txt`
                  )
              }
            ]}
          />
        </ToolStep>
      )}
    </div>
  );
}
