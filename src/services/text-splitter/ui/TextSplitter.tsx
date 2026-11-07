import React, {useEffect, useState} from "react";
import "../../../shared/ui/Tool.scss";
import {baseName, downloadBlob} from "../../../shared/files/download";
import type {TextLimits} from "../../../shared/limits";
import {SEPARATOR_OPTIONS} from "../../../shared/tabular/delimited";
import type {Source} from "../../../shared/tabular/source";
import {ResultActions} from "../../../shared/ui/ResultActions";
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
import {useTask} from "../../../shared/ui/useTask";
import {useWorker} from "../../../shared/ui/useWorker";
import type {HeaderMode, Layout, SplitOptions} from "../logic/split";
import type {TextSplitterApi} from "../worker/textSplitter.worker";

type RunResult = Awaited<ReturnType<TextSplitterApi["run"]>>;

const HEADER_OPTIONS: {value: HeaderMode; label: string}[] = [
  {value: "auto", label: "Column 1, Column 2…"},
  {value: "first-row", label: "Use the first row"},
  {value: "typed", label: "Type them"}
];

const createWorker = () =>
  new Worker(new URL("../worker/textSplitter.worker.ts", import.meta.url));

export default function TextSplitter({limits}: {limits: TextLimits}) {
  const worker = useWorker<TextSplitterApi>(createWorker);
  const task = useTask();
  const [source, setSource] = useState<Source | null>(null);
  const [separatorChoice, setSeparatorChoice] = useState(",");
  const [customSeparator, setCustomSeparator] = useState("");
  const [layout, setLayout] = useState<Layout>("columns");
  const [header, setHeader] = useState<HeaderMode>("auto");
  const [typedNames, setTypedNames] = useState("");
  const [trim, setTrim] = useState(true);
  const [result, setResult] = useState<RunResult | null>(null);
  const [formKey, setFormKey] = useState(0);

  const separator =
    separatorChoice === "custom" ? customSeparator : separatorChoice;
  const options: SplitOptions = {layout, header, typedNames, trim};
  const request =
    source && separator
      ? {source, separator, options, maxRows: limits.maxRows}
      : null;

  // A result always matches the current input and settings.
  useEffect(() => {
    setResult(null);
  }, [source, separator, layout, header, typedNames, trim]);

  const run = () => {
    if (!request) return;
    task.run("Splitting…", async () =>
      setResult(await worker.call("run", request))
    );
  };

  const download = (format: "csv" | "txt" | "xlsx") => async () => {
    if (!request) return;
    const blob = await worker.call("export", {...request, format});
    const name =
      source?.kind === "file"
        ? `${baseName(source.file.name)}-split`
        : "split-text";
    downloadBlob(blob, `${name}.${format}`);
  };

  const reset = () => {
    worker.cancel();
    setSource(null);
    setResult(null);
    task.setError(null);
    setFormKey(k => k + 1);
  };

  return (
    <div className="tool">
      <ToolStep step={1} title="Add your text">
        <SourceInput
          key={formKey}
          id="splitter-input"
          value={source}
          onChange={setSource}
          fileKinds={["text", "csv"]}
          limits={limits}
          pastePlaceholder={"Parth,25,Mumbai\nRahul,28,Pune\nAmit,30,Thane"}
        />
      </ToolStep>

      <ToolStep step={2} title="Choose how to split it">
        <div className="tool-settings">
          <div className="tool-group">
            <Field label="Split wherever there is a">
              <select
                className="tool-select"
                value={separatorChoice}
                onChange={e => setSeparatorChoice(e.target.value)}
              >
                {SEPARATOR_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value="auto">Work it out for me</option>
                <option value="custom">Something else…</option>
              </select>
            </Field>
            {separatorChoice === "custom" && (
              <Field label="Separator" hint="For example: - or ::">
                <input
                  className="tool-input tool-input-short"
                  value={customSeparator}
                  onChange={e => setCustomSeparator(e.target.value)}
                />
              </Field>
            )}
            <p className="tool-field-hint">
              Values in "double quotes" are kept together, even if they contain
              the separator.
              {separatorChoice === " " &&
                " Several spaces in a row count as one."}
            </p>
          </div>
          <div className="tool-group">
            <Choice
              label="Put the values into"
              value={layout}
              onChange={next => {
                setLayout(next);
                // A one-column list has no "first row of names" option.
                if (next === "rows" && header === "first-row")
                  setHeader("auto");
              }}
              options={[
                {value: "columns", label: "Columns"},
                {value: "rows", label: "One list, one value per line"}
              ]}
            />
            <Checkbox
              label="Remove spaces around each value"
              checked={trim}
              onChange={setTrim}
            />
          </div>
          <div className="tool-group">
            <Choice
              label="Column names"
              value={header}
              onChange={setHeader}
              options={HEADER_OPTIONS.filter(
                o => layout === "columns" || o.value !== "first-row"
              )}
            />
            {header === "typed" && (
              <Field
                label="Names, separated by commas"
                hint="Columns without a name get Column 1, Column 2…"
              >
                <input
                  className="tool-input"
                  value={typedNames}
                  placeholder="Name, Age, City"
                  onChange={e => setTypedNames(e.target.value)}
                />
              </Field>
            )}
          </div>
        </div>
      </ToolStep>

      <ToolStep step={3} title="Split">
        <ActionBar
          label="Split text"
          busyLabel={task.busy}
          disabled={!request}
          onRun={run}
          onCancel={() => worker.cancel()}
          onReset={reset}
        />
        {!source && (
          <p className="tool-muted">Add some text or a file first.</p>
        )}
        {source && !separator && (
          <p className="tool-muted">Type the separator to split on.</p>
        )}
        {task.error && <Notice tone="error">{task.error}</Notice>}
      </ToolStep>

      {result && (
        <ToolStep step={4} title="Result">
          {result.notice && <Notice tone="warning">{result.notice}</Notice>}
          <Summary
            items={[
              ["Rows", result.rowCount],
              ["Columns", result.columnCount]
            ]}
          />
          <TablePreview
            header={result.header}
            rows={result.previewRows}
            totalRows={result.rowCount}
            label="Preview of the split table"
          />
          <ResultActions
            copy={result.copyText}
            run={task.run}
            downloads={[
              {label: "Excel (.xlsx)", run: download("xlsx")},
              {label: "CSV", run: download("csv")},
              {label: "Text (.txt)", run: download("txt")}
            ]}
          />
        </ToolStep>
      )}
    </div>
  );
}
