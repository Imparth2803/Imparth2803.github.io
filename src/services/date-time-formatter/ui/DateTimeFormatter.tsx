import React, {useCallback, useEffect, useState} from "react";
import "../../../shared/ui/Tool.scss";
import {baseName, downloadBlob} from "../../../shared/files/download";
import type {TextLimits} from "../../../shared/limits";
import {listSplit, Source} from "../../../shared/tabular/source";
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
  Choice,
  Field,
  Notice,
  Summary,
  ToolStep
} from "../../../shared/ui/ToolStep";
import {useInspect} from "../../../shared/ui/useInspect";
import {useTask} from "../../../shared/ui/useTask";
import {useWorker} from "../../../shared/ui/useWorker";
import type {ShiftUnit} from "../logic/convert";
import {
  Clock,
  FORMAT_TOKENS,
  formatPattern,
  PRESET_FORMATS
} from "../logic/output";
import {Order, TWO_DIGIT_YEAR_RULE} from "../logic/parse";
import type {
  DateJob,
  DateTimeFormatterApi
} from "../worker/dateTimeFormatter.worker";
import {formatCount} from "../../../shared/text/numbers";

type RunResult = Awaited<ReturnType<DateTimeFormatterApi["run"]>>;
type Mode = DateJob["mode"];

const createWorker = () =>
  new Worker(new URL("../worker/dateTimeFormatter.worker.ts", import.meta.url));

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
const EXAMPLE = {y: 2026, m: 11, d: 7};

export default function DateTimeFormatter({limits}: {limits: TextLimits}) {
  const worker = useWorker<DateTimeFormatterApi>(createWorker);
  const inspect = useCallback<DateTimeFormatterApi["inspect"]>(
    p => worker.call("inspect", p),
    [worker]
  );
  const task = useTask();
  const [formKey, setFormKey] = useState(0);
  const [mode, setMode] = useState<Mode>("format");
  const [source, setSource] = useState<Source | null>(null);
  // Pasted dates: one per line; for "days between", two columns copied from a sheet.
  const split =
    listSplit(source) === "lines" && mode === "between"
      ? "\t"
      : listSplit(source);
  const read = {split, maxRows: limits.maxRows, excelDates: "iso" as const};
  const inspected = useInspect(inspect, source, read);
  const [choice, setChoice] = useState<SheetChoice>({
    sheet: 0,
    hasHeader: false
  });
  const [column, setColumn] = useState(0);
  const [endColumn, setEndColumn] = useState(1);

  const [order, setOrder] = useState<Order | "auto">("auto");
  const [preset, setPreset] = useState<string>("YYYY-MM-DD");
  const [customPattern, setCustomPattern] = useState("DD MMMM YYYY");
  const [clock, setClock] = useState<Clock>("24");
  const [shiftSign, setShiftSign] = useState<"none" | "add" | "subtract">(
    "none"
  );
  const [shiftAmount, setShiftAmount] = useState("1");
  const [shiftUnit, setShiftUnit] = useState<ShiftUnit>("days");
  const [weekend, setWeekend] = useState<number[]>([0, 6]);
  const [holidays, setHolidays] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);

  useEffect(() => {
    if (inspected.status !== "ready") return;
    const first = inspected.result.sheets[0];
    setChoice(defaultSheetChoice(inspected));
    setColumn(0);
    setEndColumn(first && first.columnCount > 1 ? 1 : 0);
  }, [inspected]);

  const custom = preset === "custom";
  const pattern = custom ? customPattern : preset;
  const amount = parseInt(shiftAmount, 10);
  const job = (chosenOrder: Order | "auto"): DateJob =>
    mode === "format"
      ? {
          mode,
          column,
          settings: {
            order: chosenOrder,
            pattern,
            customPattern: custom,
            clock,
            shift:
              shiftSign !== "none" && Number.isFinite(amount) && amount > 0
                ? {
                    amount: shiftSign === "add" ? amount : -amount,
                    unit: shiftUnit
                  }
                : null
          }
        }
      : {
          mode,
          startColumn: column,
          endColumn,
          settings: {
            order: chosenOrder,
            weekend,
            holidays: holidays.split(/\r?\n/)
          }
        };
  const pick =
    source && inspected.status === "ready"
      ? {source, read, sheet: choice.sheet, hasHeader: choice.hasHeader}
      : null;
  const ready = pick !== null && (!custom || customPattern.trim() !== "");

  useEffect(() => {
    setResult(null);
  }, [
    source,
    mode,
    choice,
    column,
    endColumn,
    order,
    preset,
    customPattern,
    clock,
    shiftSign,
    shiftAmount,
    shiftUnit,
    weekend,
    holidays
  ]);

  const run = (chosenOrder: Order | "auto" = order) => {
    if (!pick) return;
    task.run("Working…", async () => {
      setProblemsOnly(false);
      setResult(await worker.call("run", {pick, job: job(chosenOrder)}));
    });
  };

  const chooseOrder = (chosen: Order) => {
    setOrder(chosen);
    run(chosen);
  };

  const download = (format: "csv" | "xlsx") => async () => {
    if (!pick) return;
    const blob = await worker.call("export", {pick, job: job(order), format});
    const name =
      source?.kind === "file" ? `${baseName(source.file.name)}-dates` : "dates";
    downloadBlob(blob, `${name}.${format}`);
  };

  const reset = () => {
    worker.cancel();
    setSource(null);
    setResult(null);
    task.setError(null);
    setFormKey(k => k + 1);
  };

  const toggleWeekend = (day: number, on: boolean) =>
    setWeekend(current =>
      on ? [...current, day] : current.filter(d => d !== day)
    );

  const done = result?.status === "done" ? result : null;
  const header =
    mode === "format"
      ? ["Original", "Result", "Note"]
      : ["Start", "End", "Days between", "Working days", "Note"];
  const shown = done ? (problemsOnly ? done.problemPreview : done.preview) : [];

  return (
    <div className="tool">
      <ToolStep step={1} title="What do you want to do?">
        <Choice
          label="Task"
          value={mode}
          onChange={setMode}
          options={[
            {value: "format", label: "Change the format (or add days)"},
            {value: "between", label: "Count days between two dates"}
          ]}
        />
      </ToolStep>

      <ToolStep step={2} title="Add your dates">
        <SourceInput
          key={formKey}
          id="dates-input"
          value={source}
          onChange={setSource}
          fileKinds={["text", "csv", "excel"]}
          limits={limits}
          pastePlaceholder={
            mode === "format"
              ? "One per line, for example:\n07/11/2026\n7 Nov 2026\n2026.11.07"
              : "Start and end dates side by side, copied from Excel:\n02/11/2026\t06/11/2026"
          }
        />
        <SourceSetup state={inspected} choice={choice} onChoice={setChoice}>
          {labels =>
            mode === "format" ? (
              <ColumnSelect
                labels={labels}
                value={column}
                onChange={setColumn}
                label="Column with the dates"
              />
            ) : (
              <div className="tool-inline">
                <ColumnSelect
                  labels={labels}
                  value={column}
                  onChange={setColumn}
                  label="Start date column"
                />
                <ColumnSelect
                  labels={labels}
                  value={endColumn}
                  onChange={setEndColumn}
                  label="End date column"
                />
              </div>
            )
          }
        </SourceSetup>
      </ToolStep>

      <ToolStep step={3} title="Choose the settings">
        <div className="tool-settings">
          <Field
            label="How are dates like 05/06/2026 written?"
            hint={`Only matters for dates written with numbers. ${TWO_DIGIT_YEAR_RULE}`}
          >
            <select
              className="tool-select"
              value={order}
              onChange={e => setOrder(e.target.value as Order | "auto")}
            >
              <option value="auto">
                Work it out (I'll be asked if unsure)
              </option>
              <option value="dmy">Day first: 25/12/2026</option>
              <option value="mdy">Month first: 12/25/2026</option>
            </select>
          </Field>

          {mode === "format" ? (
            <>
              <div className="tool-group">
                <Field label="Change dates to">
                  <select
                    className="tool-select"
                    value={preset}
                    onChange={e => setPreset(e.target.value)}
                  >
                    {PRESET_FORMATS.map(f => (
                      <option key={f} value={f}>
                        {f} ({formatPattern(EXAMPLE, null, f)})
                      </option>
                    ))}
                    <option value="custom">My own format…</option>
                  </select>
                </Field>
                {custom && (
                  <>
                    <Field
                      label="Your format"
                      hint={`Example: ${
                        customPattern.trim()
                          ? formatPattern(
                              EXAMPLE,
                              {h: 14, mi: 30, s: 0},
                              customPattern
                            )
                          : "—"
                      }`}
                    >
                      <input
                        className="tool-input"
                        value={customPattern}
                        onChange={e => setCustomPattern(e.target.value)}
                      />
                    </Field>
                    <details className="tool-muted">
                      <summary>Letters you can use</summary>
                      <ul className="tool-list">
                        {FORMAT_TOKENS.map(([token, example]) => (
                          <li key={token}>
                            <code>{token}</code> → {example}
                          </li>
                        ))}
                        <li>
                          Put other words in [brackets] to keep them as written.
                        </li>
                      </ul>
                    </details>
                  </>
                )}
                {!custom && (
                  <Field label="Times">
                    <select
                      className="tool-select"
                      value={clock}
                      onChange={e => setClock(e.target.value as Clock)}
                    >
                      <option value="24">24-hour clock (14:30)</option>
                      <option value="12">12-hour clock (2:30 PM)</option>
                      <option value="none">Leave times out</option>
                    </select>
                  </Field>
                )}
              </div>
              <div className="tool-group">
                <Field label="Also">
                  <select
                    className="tool-select"
                    value={shiftSign}
                    onChange={e =>
                      setShiftSign(
                        e.target.value as "none" | "add" | "subtract"
                      )
                    }
                  >
                    <option value="none">Keep the same dates</option>
                    <option value="add">Add…</option>
                    <option value="subtract">Subtract…</option>
                  </select>
                </Field>
                {shiftSign !== "none" && (
                  <div className="tool-inline">
                    <Field label="How many">
                      <input
                        className="tool-input"
                        inputMode="numeric"
                        value={shiftAmount}
                        onChange={e =>
                          setShiftAmount(e.target.value.replace(/\D/g, ""))
                        }
                      />
                    </Field>
                    <Field label="Of">
                      <select
                        className="tool-select"
                        value={shiftUnit}
                        onChange={e =>
                          setShiftUnit(e.target.value as ShiftUnit)
                        }
                      >
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                      </select>
                    </Field>
                  </div>
                )}
                {shiftSign !== "none" && shiftUnit === "months" && (
                  <p className="tool-field-hint">
                    When the new month is shorter, its last day is used (31 Jan
                    + 1 month = 28 Feb).
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <fieldset className="tool-group">
                <legend>Weekend days (not working days)</legend>
                <div className="tool-inline">
                  {[1, 2, 3, 4, 5, 6, 0].map(day => (
                    <Checkbox
                      key={day}
                      label={WEEKDAYS[day]!}
                      checked={weekend.includes(day)}
                      onChange={on => toggleWeekend(day, on)}
                    />
                  ))}
                </div>
              </fieldset>
              <Field
                label="Holidays (optional)"
                hint="One date per line. Holidays aren't counted as working days."
              >
                <textarea
                  className="tool-textarea"
                  rows={4}
                  value={holidays}
                  onChange={e => setHolidays(e.target.value)}
                  placeholder={"25/12/2026\n26/01/2027"}
                />
              </Field>
              <p className="tool-field-hint">
                “Days between” is the end date minus the start date (2 Nov to 6
                Nov is 4). “Working days” counts both the start and end day,
                leaving out weekends and holidays, the same way Excel’s
                NETWORKDAYS does.
              </p>
            </>
          )}
        </div>
      </ToolStep>

      <ToolStep step={4} title="Convert">
        <ActionBar
          label={mode === "format" ? "Convert dates" : "Count days"}
          busyLabel={task.busy}
          disabled={!ready}
          onRun={() => run()}
          onCancel={() => worker.cancel()}
          onReset={reset}
        />
        {!source && <p className="tool-muted">Add some dates first.</p>}
        {task.error && <Notice tone="error">{task.error}</Notice>}
        {result?.status === "ask" && (
          <Notice tone="warning">
            <p>{result.reason}</p>
            <p>How are the dates in this list written?</p>
            <div className="tool-actions-row">
              <button
                type="button"
                className="tool-button"
                onClick={() => chooseOrder("dmy")}
              >
                Day first (25/12/2026)
              </button>
              <button
                type="button"
                className="tool-button"
                onClick={() => chooseOrder("mdy")}
              >
                Month first (12/25/2026)
              </button>
            </div>
          </Notice>
        )}
        {result?.status === "holiday-problems" && (
          <Notice tone="error">
            These holidays aren't dates the tool can read:{" "}
            {result.problems.join(", ")}. Fix or remove them and try again.
          </Notice>
        )}
      </ToolStep>

      {done && (
        <ToolStep step={5} title="Result">
          {done.orderMessage && (
            <Notice tone="info">{done.orderMessage}</Notice>
          )}
          <Summary
            items={[
              ["Rows", done.counts.total],
              ["Converted", done.counts.converted],
              ["Couldn't convert", done.counts.problems],
              ["Empty", done.counts.empty]
            ]}
          />
          {done.counts.problems > 0 && (
            <Checkbox
              label={`Show only the ${formatCount(done.counts.problems)} ${
                done.counts.problems === 1 ? "row" : "rows"
              } to check`}
              checked={problemsOnly}
              onChange={setProblemsOnly}
            />
          )}
          <TablePreview
            header={header}
            rows={shown.map(r => r.cells)}
            highlight={shown.map(r => r.problem)}
            totalRows={problemsOnly ? done.counts.problems : done.counts.total}
            label="Converted dates"
          />
          <ResultActions
            copy={done.copyText}
            run={task.run}
            downloads={[
              {label: "Excel (.xlsx)", run: download("xlsx")},
              {label: "CSV", run: download("csv")}
            ]}
          />
          <p className="tool-muted">
            Copy gives just the new {mode === "format" ? "dates" : "numbers"},
            one row per line, to paste next to your data. Downloads include your
            whole table with the new columns added.
          </p>
        </ToolStep>
      )}
    </div>
  );
}
