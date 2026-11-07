import React, {useEffect, useState} from "react";
import "../../../shared/ui/Tool.scss";
import {baseName, downloadBlob} from "../../../shared/files/download";
import type {TextLimits} from "../../../shared/limits";
import type {Source} from "../../../shared/tabular/source";
import {
  EACH_WORD_RULE,
  LetterCase,
  SENTENCE_CASE_RULE,
  TITLE_CASE_RULE
} from "../../../shared/text/letterCase";
import {ResultActions} from "../../../shared/ui/ResultActions";
import {SourceInput} from "../../../shared/ui/SourceInput";
import {TextPreview} from "../../../shared/ui/TablePreview";
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
import {
  FormatOptions,
  LineOrder,
  STEPS,
  TextStats,
  WrapMode
} from "../logic/format";
import type {TextFormatterApi} from "../worker/textFormatter.worker";

type RunResult = Awaited<ReturnType<TextFormatterApi["run"]>>;

const createWorker = () =>
  new Worker(new URL("../worker/textFormatter.worker.ts", import.meta.url));

const CASES: {value: LetterCase; label: string; rule?: string}[] = [
  {value: "keep", label: "Leave as it is"},
  {value: "upper", label: "UPPER CASE"},
  {value: "lower", label: "lower case"},
  {value: "title", label: "Title Case", rule: TITLE_CASE_RULE},
  {value: "sentence", label: "Sentence case", rule: SENTENCE_CASE_RULE},
  {value: "each-word", label: "Capitalize Each Word", rule: EACH_WORD_RULE}
];

const ORDERS: {value: LineOrder; label: string}[] = [
  {value: "keep", label: "Keep the order"},
  {value: "az", label: "Sort A to Z"},
  {value: "za", label: "Sort Z to A"},
  {value: "reverse", label: "Reverse the order"}
];

function statsItems(label: string, s: TextStats): [string, number][] {
  return [
    [`${label} words`, s.words],
    [`${label} characters`, s.characters],
    [`${label} lines`, s.lines]
  ];
}

export default function TextFormatter({limits}: {limits: TextLimits}) {
  const worker = useWorker<TextFormatterApi>(createWorker);
  const task = useTask();
  const [formKey, setFormKey] = useState(0);
  const [source, setSource] = useState<Source | null>(null);
  const [letterCase, setLetterCase] = useState<LetterCase>("keep");
  const [trimLines, setTrimLines] = useState(true);
  const [collapseSpaces, setCollapseSpaces] = useState(true);
  const [removeLineBreaks, setRemoveLineBreaks] = useState(false);
  const [removeSpecial, setRemoveSpecial] = useState(false);
  const [removeNumbers, setRemoveNumbers] = useState(false);
  const [removePunctuation, setRemovePunctuation] = useState(false);
  const [removeNumbering, setRemoveNumbering] = useState(false);
  const [find, setFind] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wrapAt, setWrapAt] = useState("");
  const [wrapMode, setWrapMode] = useState<WrapMode>("word");
  const [lineOrder, setLineOrder] = useState<LineOrder>("keep");
  const [addNumbering, setAddNumbering] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);

  const wrapNumber = parseInt(wrapAt, 10);
  const options: FormatOptions = {
    removeNumbering,
    removeSpecial,
    removeNumbers,
    removePunctuation,
    find,
    replaceWith,
    matchCase,
    trimLines,
    collapseSpaces,
    letterCase,
    removeLineBreaks,
    lineOrder,
    wrapAt: Number.isFinite(wrapNumber) && wrapNumber > 0 ? wrapNumber : null,
    wrapMode,
    addNumbering,
    prefix,
    suffix
  };

  useEffect(() => {
    setResult(null);
  }, [
    source,
    letterCase,
    trimLines,
    collapseSpaces,
    removeLineBreaks,
    removeSpecial,
    removeNumbers,
    removePunctuation,
    removeNumbering,
    find,
    replaceWith,
    matchCase,
    wrapAt,
    wrapMode,
    lineOrder,
    addNumbering,
    prefix,
    suffix
  ]);

  const run = () => {
    if (!source) return;
    task.run("Formatting…", async () =>
      setResult(
        await worker.call("run", {source, options, maxLines: limits.maxRows})
      )
    );
  };

  const reset = () => {
    worker.cancel();
    setSource(null);
    setResult(null);
    task.setError(null);
    setFormKey(k => k + 1);
  };

  const caseRule = CASES.find(c => c.value === letterCase)?.rule;

  return (
    <div className="tool">
      <ToolStep step={1} title="Add your text">
        <SourceInput
          key={formKey}
          id="formatter-input"
          value={source}
          onChange={setSource}
          fileKinds={["text"]}
          limits={limits}
          pastePlaceholder={"   PARTH    TAWDE\n   rahul sharma\n   AMIT PATIL"}
        />
      </ToolStep>

      <ToolStep step={2} title="Choose the changes">
        <div className="tool-settings">
          <div className="tool-group">
            <Field label="Letter case" hint={caseRule}>
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
            <Field label="Lines">
              <select
                className="tool-select"
                value={lineOrder}
                onChange={e => setLineOrder(e.target.value as LineOrder)}
              >
                {ORDERS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <fieldset className="tool-group">
            <legend>Spaces and line breaks</legend>
            <Checkbox
              label="Remove spaces at the start and end of lines"
              checked={trimLines}
              onChange={setTrimLines}
            />
            <Checkbox
              label="Turn several spaces into one"
              checked={collapseSpaces}
              onChange={setCollapseSpaces}
            />
            <Checkbox
              label="Remove line breaks"
              hint="Joins everything into one line, with a space between."
              checked={removeLineBreaks}
              onChange={setRemoveLineBreaks}
            />
          </fieldset>
          <fieldset className="tool-group">
            <legend>Remove</legend>
            <Checkbox
              label="Special characters"
              hint="Symbols like @ # $ % & * + = / and emoji."
              checked={removeSpecial}
              onChange={setRemoveSpecial}
            />
            <Checkbox
              label="Punctuation"
              hint={"Marks like . , ; : ! ? ' \" - ( )"}
              checked={removePunctuation}
              onChange={setRemovePunctuation}
            />
            <Checkbox
              label="Numbers"
              checked={removeNumbers}
              onChange={setRemoveNumbers}
            />
            <Checkbox
              label="Numbering at the start of lines"
              hint="Like “1.”, “2)” or “(3)”."
              checked={removeNumbering}
              onChange={setRemoveNumbering}
            />
          </fieldset>
        </div>

        <div className="tool-settings">
          <div className="tool-group">
            <div className="tool-inline">
              <Field label="Find">
                <input
                  className="tool-input"
                  value={find}
                  onChange={e => setFind(e.target.value)}
                />
              </Field>
              <Field label="Replace with">
                <input
                  className="tool-input"
                  value={replaceWith}
                  placeholder="(nothing)"
                  onChange={e => setReplaceWith(e.target.value)}
                />
              </Field>
            </div>
            <Checkbox
              label="Only when upper and lower case match exactly"
              checked={matchCase}
              onChange={setMatchCase}
            />
          </div>
          <div className="tool-group">
            <Field
              label="Break lines longer than"
              hint="characters (leave empty to keep lines as they are)"
            >
              <input
                className="tool-input tool-input-short"
                inputMode="numeric"
                value={wrapAt}
                onChange={e => setWrapAt(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            {options.wrapAt !== null && (
              <Choice
                label="Where to break"
                value={wrapMode}
                onChange={setWrapMode}
                options={[
                  {value: "word", label: "After the last whole word"},
                  {value: "exact", label: "Exactly at that many characters"}
                ]}
              />
            )}
          </div>
          <div className="tool-group">
            <Checkbox
              label="Number each line (1. 2. 3.)"
              checked={addNumbering}
              onChange={setAddNumbering}
            />
            <div className="tool-inline">
              <Field label="Add to the start of each line">
                <input
                  className="tool-input"
                  value={prefix}
                  onChange={e => setPrefix(e.target.value)}
                />
              </Field>
              <Field label="Add to the end of each line">
                <input
                  className="tool-input"
                  value={suffix}
                  onChange={e => setSuffix(e.target.value)}
                />
              </Field>
            </div>
            <p className="tool-field-hint">
              Numbering and added text skip empty lines.
            </p>
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

      <ToolStep step={3} title="Format">
        <ActionBar
          label="Format text"
          busyLabel={task.busy}
          disabled={!source}
          onRun={run}
          onCancel={() => worker.cancel()}
          onReset={reset}
        />
        {!source && <p className="tool-muted">Add some text first.</p>}
        {task.error && <Notice tone="error">{task.error}</Notice>}
      </ToolStep>

      {result && (
        <ToolStep step={4} title="Result">
          {result.notice && <Notice tone="warning">{result.notice}</Notice>}
          <Summary
            items={[
              ...statsItems("Before:", result.before),
              ...statsItems("After:", result.after)
            ]}
          />
          <TextPreview
            text={result.preview}
            totalLength={result.length}
            label="Formatted text"
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
                        ? baseName(source.file.name) + "-formatted"
                        : "formatted-text"
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
