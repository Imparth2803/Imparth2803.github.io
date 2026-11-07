import React, {useCallback, useEffect, useState} from "react";
import "../../../shared/ui/Tool.scss";
import {downloadBlob} from "../../../shared/files/download";
import type {TextLimits} from "../../../shared/limits";
import type {ColumnPick, InspectResult} from "../../../shared/tabular/inspect";
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
  Notice,
  Summary,
  ToolStep
} from "../../../shared/ui/ToolStep";
import {InspectFn, useInspect} from "../../../shared/ui/useInspect";
import {useTask} from "../../../shared/ui/useTask";
import {useWorker} from "../../../shared/ui/useWorker";
import {RESULT_TITLES, ResultKey} from "../logic/compare";
import type {TwoListComparatorApi} from "../worker/twoListComparator.worker";
import {formatCount} from "../../../shared/text/numbers";

type RunResult = Awaited<ReturnType<TwoListComparatorApi["run"]>>;

const createWorker = () =>
  new Worker(new URL("../worker/twoListComparator.worker.ts", import.meta.url));

const TABS = Object.keys(RESULT_TITLES) as ResultKey[];

/* One list's input, sheet and column. Reports the chosen column upwards. */
function ListInput({
  id,
  label,
  placeholder,
  limits,
  inspect,
  resetKey,
  onPick
}: {
  id: string;
  label: string;
  placeholder: string;
  limits: TextLimits;
  inspect: InspectFn;
  resetKey: number;
  onPick: (pick: ColumnPick | null) => void;
}) {
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

  useEffect(() => {
    setSource(null);
  }, [resetKey]);
  useEffect(() => {
    if (inspected.status !== "ready") return;
    setChoice(defaultSheetChoice(inspected));
    setColumn(0);
  }, [inspected]);
  useEffect(() => {
    onPick(
      source && inspected.status === "ready"
        ? {
            source,
            read: {split, maxRows: limits.maxRows},
            sheet: choice.sheet,
            column,
            hasHeader: choice.hasHeader
          }
        : null
    );
  }, [onPick, source, split, limits.maxRows, inspected, choice, column]);

  return (
    <div className="tool-source">
      <SourceInput
        key={resetKey}
        id={id}
        label={label}
        value={source}
        onChange={setSource}
        fileKinds={["text", "csv", "excel"]}
        limits={limits}
        pastePlaceholder={placeholder}
      />
      <SourceSetup state={inspected} choice={choice} onChoice={setChoice}>
        {labels => (
          <ColumnSelect
            labels={labels}
            value={column}
            onChange={setColumn}
            label="Column to compare"
          />
        )}
      </SourceSetup>
    </div>
  );
}

export default function TwoListComparator({limits}: {limits: TextLimits}) {
  const worker = useWorker<TwoListComparatorApi>(createWorker);
  const inspect = useCallback<InspectFn>(
    (p): Promise<InspectResult> => worker.call("inspect", p),
    [worker]
  );
  const task = useTask();
  const [resetKey, setResetKey] = useState(0);
  const [a, setA] = useState<ColumnPick | null>(null);
  const [b, setB] = useState<ColumnPick | null>(null);
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [ignoreSpaces, setIgnoreSpaces] = useState(true);
  const [result, setResult] = useState<RunResult | null>(null);
  const [tab, setTab] = useState<ResultKey>("both");

  const options = {matchCase: !ignoreCase, ignoreSpaces};
  useEffect(() => {
    setResult(null);
  }, [a, b, ignoreCase, ignoreSpaces]);

  const run = () => {
    if (!a || !b) return;
    task.run("Comparing…", async () => {
      setTab("both");
      setResult(await worker.call("run", {a, b, options}));
    });
  };

  const download =
    (what: ResultKey | "all", format: "csv" | "xlsx") => async () => {
      if (!a || !b) return;
      const blob = await worker.call("export", {
        a,
        b,
        options,
        what,
        format
      });
      const name =
        what === "all"
          ? "list-comparison"
          : RESULT_TITLES[what].toLowerCase().replace(/\s+/g, "-");
      downloadBlob(blob, `${name}.${format}`);
    };

  const reset = () => {
    worker.cancel();
    setResult(null);
    task.setError(null);
    setResetKey(k => k + 1);
  };

  const current = result?.lists[tab];
  const repeatedTab = tab === "repeatedA" || tab === "repeatedB";

  return (
    <div className="tool">
      <ToolStep step={1} title="Add your two lists">
        <div className="tool-columns">
          <ListInput
            id="list-a"
            label="List A"
            placeholder={"Parth\nRahul\nAmit\nSneha"}
            limits={limits}
            inspect={inspect}
            resetKey={resetKey}
            onPick={setA}
          />
          <ListInput
            id="list-b"
            label="List B"
            placeholder={"Parth\nRahul\nPriya"}
            limits={limits}
            inspect={inspect}
            resetKey={resetKey}
            onPick={setB}
          />
        </div>
      </ToolStep>

      <ToolStep step={2} title="Choose how to match">
        <div className="tool-group">
          <Checkbox
            label="Treat upper and lower case as the same"
            hint="“Parth” and “PARTH” count as a match."
            checked={ignoreCase}
            onChange={setIgnoreCase}
          />
          <Checkbox
            label="Ignore spaces at the start and end"
            hint="“ Parth ” and “Parth” count as a match."
            checked={ignoreSpaces}
            onChange={setIgnoreSpaces}
          />
          <p className="tool-field-hint">
            Results always show the values exactly as they appear in your lists.
            Empty entries are counted but not compared.
          </p>
        </div>
      </ToolStep>

      <ToolStep step={3} title="Compare">
        <ActionBar
          label="Compare lists"
          busyLabel={task.busy}
          disabled={!a || !b}
          onRun={run}
          onCancel={() => worker.cancel()}
          onReset={reset}
        />
        {(!a || !b) && <p className="tool-muted">Add both lists first.</p>}
        {task.error && <Notice tone="error">{task.error}</Notice>}
      </ToolStep>

      {result && current && (
        <ToolStep step={4} title="Result">
          <Summary
            items={[
              ["List A entries", result.totals.totalA],
              ["List B entries", result.totals.totalB],
              ["In both", result.lists.both.count],
              ["Only in A", result.lists.onlyA.count],
              ["Only in B", result.lists.onlyB.count]
            ]}
          />
          {(result.totals.blankA > 0 || result.totals.blankB > 0) && (
            <p className="tool-muted">
              Empty entries left out: {formatCount(result.totals.blankA)} in
              List A, {formatCount(result.totals.blankB)} in List B.
            </p>
          )}
          <div className="tool-tabs" role="tablist" aria-label="Results">
            {TABS.map(key => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
              >
                {RESULT_TITLES[key]}
                <span className="tool-tab-count">
                  {formatCount(result.lists[key].count)}
                </span>
              </button>
            ))}
          </div>
          {current.count === 0 ? (
            <p className="tool-muted">Nothing here.</p>
          ) : (
            <TablePreview
              header={repeatedTab ? ["Value", "Times"] : null}
              rows={current.preview}
              totalRows={current.count}
              label={RESULT_TITLES[tab]}
            />
          )}
          <ResultActions
            copy={current.count > 0 ? current.text : undefined}
            run={task.run}
            downloads={[
              ...(current.count > 0
                ? [
                    {label: "This list as CSV", run: download(tab, "csv")},
                    {label: "This list as Excel", run: download(tab, "xlsx")}
                  ]
                : []),
              {label: "Everything (Excel)", run: download("all", "xlsx")}
            ]}
          />
        </ToolStep>
      )}
    </div>
  );
}
