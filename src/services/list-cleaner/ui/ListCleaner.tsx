import React, {useCallback, useEffect, useState} from "react";
import "../../../shared/ui/Tool.scss";
import {baseName, downloadBlob} from "../../../shared/files/download";
import type {TextLimits} from "../../../shared/limits";
import type {ColumnPick} from "../../../shared/tabular/inspect";
import {listSplit, Source} from "../../../shared/tabular/source";
import {columnLabels} from "../../../shared/tabular/table";
import {LetterCase, TITLE_CASE_RULE} from "../../../shared/text/letterCase";
import {ColumnSelect} from "../../../shared/ui/ColumnSelect";
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
  Field,
  Notice,
  Summary,
  ToolStep
} from "../../../shared/ui/ToolStep";
import {useInspect} from "../../../shared/ui/useInspect";
import {useTask} from "../../../shared/ui/useTask";
import {useWorker} from "../../../shared/ui/useWorker";
import {
  CleanOptions,
  REASON_LABELS,
  SortOrder,
  STEPS
} from "../logic/cleanList";
import type {ListCleanerApi} from "../worker/listCleaner.worker";
import {formatCount} from "../../../shared/text/numbers";

type RunResult = Awaited<ReturnType<ListCleanerApi["run"]>>;

const createWorker = () =>
  new Worker(new URL("../worker/listCleaner.worker.ts", import.meta.url));

const CASES: {value: LetterCase; label: string}[] = [
  {value: "keep", label: "Leave as it is"},
  {value: "upper", label: "UPPER CASE"},
  {value: "lower", label: "lower case"},
  {value: "title", label: "Title Case"}
];

const SORTS: {value: SortOrder; label: string}[] = [
  {value: "none", label: "Keep the original order"},
  {value: "az", label: "A to Z"},
  {value: "za", label: "Z to A"},
  {value: "small-large", label: "Numbers, smallest first"},
  {value: "large-small", label: "Numbers, largest first"}
];

function toLength(text: string): number | null {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function ListCleaner({limits}: {limits: TextLimits}) {
  const worker = useWorker<ListCleanerApi>(createWorker);
  const inspect = useCallback<ListCleanerApi["inspect"]>(
    p => worker.call("inspect", p),
    [worker]
  );
  const task = useTask();
  const [formKey, setFormKey] = useState(0);
  const [source, setSource] = useState<Source | null>(null);
  const split = listSplit(source);
  const inspected = useInspect(inspect, source, {
    split,
    maxRows: limits.maxRows
  });
  const [choice, setChoice] = useState<SheetChoice>({
    sheet: 0,
    hasHeader: false
  });
  const [column, setColumn] = useState(0);

  const [trim, setTrim] = useState(true);
  const [collapseSpaces, setCollapseSpaces] = useState(true);
  const [removeSpecial, setRemoveSpecial] = useState(false);
  const [removeNumbers, setRemoveNumbers] = useState(false);
  const [removeLetters, setRemoveLetters] = useState(false);
  const [letterCase, setLetterCase] = useState<LetterCase>("keep");
  const [blockedWords, setBlockedWords] = useState("");
  const [minLength, setMinLength] = useState("");
  const [maxLength, setMaxLength] = useState("");
  const [removeEmpty, setRemoveEmpty] = useState(true);
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [sort, setSort] = useState<SortOrder>("none");
  const [result, setResult] = useState<RunResult | null>(null);
  const [view, setView] = useState<"kept" | "removed">("kept");

  useEffect(() => {
    if (inspected.status !== "ready") return;
    setChoice(defaultSheetChoice(inspected));
    setColumn(0);
  }, [inspected]);

  const options: CleanOptions = {
    trim,
    collapseSpaces,
    removeSpecial,
    removeNumbers,
    removeLetters,
    letterCase,
    blockedWords: blockedWords.split(","),
    minLength: toLength(minLength),
    maxLength: toLength(maxLength),
    removeEmpty,
    removeDuplicates,
    ignoreCase,
    sort
  };
  const pick: ColumnPick | null =
    source && inspected.status === "ready"
      ? {
          source,
          read: {split, maxRows: limits.maxRows},
          sheet: choice.sheet,
          column,
          hasHeader: choice.hasHeader
        }
      : null;

  useEffect(() => {
    setResult(null);
  }, [
    source,
    choice,
    column,
    trim,
    collapseSpaces,
    removeSpecial,
    removeNumbers,
    removeLetters,
    letterCase,
    blockedWords,
    minLength,
    maxLength,
    removeEmpty,
    removeDuplicates,
    ignoreCase,
    sort
  ]);

  const sheet =
    inspected.status === "ready"
      ? inspected.result.sheets[choice.sheet]
      : undefined;
  const columnName = sheet
    ? columnLabels(sheet.firstRows[0], sheet.columnCount, choice.hasHeader)[
        column
      ] ?? "List"
    : "List";

  const run = () => {
    if (!pick) return;
    task.run("Cleaning…", async () => {
      setView("kept");
      setResult(await worker.call("run", {pick, options}));
    });
  };

  const fileName =
    source?.kind === "file"
      ? `${baseName(source.file.name)}-cleaned`
      : "cleaned-list";
  const download = (format: "csv" | "xlsx") => async () => {
    if (!pick) return;
    const blob = await worker.call("export", {
      pick,
      options,
      format,
      columnName: choice.hasHeader ? columnName : "List"
    });
    downloadBlob(blob, `${fileName}.${format}`);
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
      <ToolStep step={1} title="Add your list">
        <SourceInput
          key={formKey}
          id="cleaner-input"
          value={source}
          onChange={setSource}
          fileKinds={["text", "csv", "excel"]}
          limits={limits}
          pastePlaceholder={
            "One entry per line, for example:\nParth\nRahul\n\nParth\nAMIT"
          }
        />
        <SourceSetup state={inspected} choice={choice} onChoice={setChoice}>
          {labels => (
            <ColumnSelect labels={labels} value={column} onChange={setColumn} />
          )}
        </SourceSetup>
      </ToolStep>

      <ToolStep step={2} title="Choose what to clean">
        <div className="tool-settings">
          <fieldset className="tool-group">
            <legend>Spaces</legend>
            <Checkbox
              label="Remove spaces at the start and end"
              checked={trim}
              onChange={setTrim}
            />
            <Checkbox
              label="Turn several spaces into one"
              checked={collapseSpaces}
              onChange={setCollapseSpaces}
            />
          </fieldset>
          <fieldset className="tool-group">
            <legend>Remove characters</legend>
            <Checkbox
              label="Special characters"
              hint="Anything that isn't a letter, number or space, like @ # % - ."
              checked={removeSpecial}
              onChange={setRemoveSpecial}
            />
            <Checkbox
              label="Numbers"
              checked={removeNumbers}
              onChange={setRemoveNumbers}
            />
            <Checkbox
              label="Letters"
              checked={removeLetters}
              onChange={setRemoveLetters}
            />
          </fieldset>
          <div className="tool-group">
            <Field
              label="Letter case"
              hint={letterCase === "title" ? TITLE_CASE_RULE : undefined}
            >
              <select
                className="tool-select"
                value={letterCase}
                onChange={e => setLetterCase(e.target.value as LetterCase)}
              >
                {CASES.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sort">
              <select
                className="tool-select"
                value={sort}
                onChange={e => setSort(e.target.value as SortOrder)}
              >
                {SORTS.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <div className="tool-settings">
          <fieldset className="tool-group">
            <legend>Remove entries</legend>
            <Checkbox
              label="Empty entries"
              checked={removeEmpty}
              onChange={setRemoveEmpty}
            />
            <Checkbox
              label="Repeated entries (the first one is kept)"
              checked={removeDuplicates}
              onChange={setRemoveDuplicates}
            />
            {removeDuplicates && (
              <Checkbox
                label="Treat “Parth” and “PARTH” as the same"
                checked={ignoreCase}
                onChange={setIgnoreCase}
              />
            )}
          </fieldset>
          <div className="tool-group">
            <Field
              label="Remove entries that contain"
              hint="Separate words with commas. Upper and lower case are treated the same."
            >
              <input
                className="tool-input"
                value={blockedWords}
                placeholder="test, sample"
                onChange={e => setBlockedWords(e.target.value)}
              />
            </Field>
            <div className="tool-inline">
              <Field label="Shorter than" hint="characters">
                <input
                  className="tool-input"
                  inputMode="numeric"
                  value={minLength}
                  onChange={e =>
                    setMinLength(e.target.value.replace(/\D/g, ""))
                  }
                />
              </Field>
              <Field label="Longer than" hint="characters">
                <input
                  className="tool-input"
                  inputMode="numeric"
                  value={maxLength}
                  onChange={e =>
                    setMaxLength(e.target.value.replace(/\D/g, ""))
                  }
                />
              </Field>
            </div>
          </div>
        </div>
        <details className="tool-muted">
          <summary>In what order are these done?</summary>
          <ol className="tool-list">
            {STEPS.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      </ToolStep>

      <ToolStep step={3} title="Clean">
        <ActionBar
          label="Clean list"
          busyLabel={task.busy}
          disabled={!pick}
          onRun={run}
          onCancel={() => worker.cancel()}
          onReset={reset}
        />
        {!source && <p className="tool-muted">Add a list first.</p>}
        {task.error && <Notice tone="error">{task.error}</Notice>}
      </ToolStep>

      {result && (
        <ToolStep step={4} title="Result">
          <Summary
            items={[
              ["Before", result.before],
              ["After", result.after],
              ["Removed", result.removedCount],
              ...Object.entries(result.byReason).map(
                ([reason, n]) =>
                  [REASON_LABELS[reason as keyof typeof REASON_LABELS], n] as [
                    string,
                    number
                  ]
              )
            ]}
          />
          <div className="tool-tabs" role="tablist" aria-label="Result">
            <button
              type="button"
              role="tab"
              aria-selected={view === "kept"}
              onClick={() => setView("kept")}
            >
              Cleaned list
              <span className="tool-tab-count">
                {formatCount(result.after)}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "removed"}
              onClick={() => setView("removed")}
            >
              Removed
              <span className="tool-tab-count">
                {formatCount(result.removedCount)}
              </span>
            </button>
          </div>
          {view === "kept" ? (
            <TablePreview
              header={null}
              rows={result.keptPreview.map(value => [value])}
              totalRows={result.after}
              label="Cleaned list"
            />
          ) : (
            <TablePreview
              header={["Row", "Entry", "Why it was removed"]}
              rows={result.removedPreview.map(r => [
                String(r.line),
                r.original,
                REASON_LABELS[r.reason]
              ])}
              totalRows={result.removedCount}
              label="Removed entries"
            />
          )}
          <ResultActions
            copy={result.text}
            run={task.run}
            downloads={[
              {
                label: "Text (.txt)",
                run: () => downloadBlob(result.text, `${fileName}.txt`)
              },
              {label: "CSV", run: download("csv")},
              {label: "Excel (.xlsx)", run: download("xlsx")}
            ]}
          />
        </ToolStep>
      )}
    </div>
  );
}
