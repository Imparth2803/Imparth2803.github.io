import React, {useState} from "react";
import {
  acceptedExtensions,
  describeKinds,
  fileExtension,
  FileKind
} from "../files/fileTypes";
import {FileLimits, fileLimitMB, formatBytes} from "../limits";
import type {Source} from "../tabular/source";
import {DropZone} from "./DropZone";
import {Notice} from "./ToolStep";

type Mode = "text" | "file";

/* Paste text or open a file (drag and drop, or the Choose a file button for
   keyboard and touch users). Checks the file type and size straight away. */
export function SourceInput({
  id,
  label,
  value,
  onChange,
  fileKinds,
  limits,
  pastePlaceholder
}: {
  id: string;
  label?: string;
  value: Source | null;
  onChange: (source: Source | null) => void;
  fileKinds: readonly FileKind[];
  limits: FileLimits;
  pastePlaceholder: string;
}) {
  const [mode, setMode] = useState<Mode>(value?.kind ?? "text");
  const [text, setText] = useState(value?.kind === "text" ? value.text : "");
  const [file, setFile] = useState<File | null>(
    value?.kind === "file" ? value.file : null
  );
  const [problem, setProblem] = useState<string | null>(null);
  const extensions = acceptedExtensions(fileKinds);
  const maxMB = fileLimitMB(limits);

  const switchMode = (next: Mode) => {
    setMode(next);
    setProblem(null);
    if (next === "text") onChange(text ? {kind: "text", text} : null);
    else onChange(file ? {kind: "file", file} : null);
  };

  const changeText = (next: string) => {
    setText(next);
    if (next.length > maxMB * 1024 * 1024) {
      setProblem(
        `That's more text than this tool can take at once (about ${maxMB} MB). Paste a smaller part, or save it as a file and split it.`
      );
      onChange(null);
      return;
    }
    setProblem(null);
    onChange(next ? {kind: "text", text: next} : null);
  };

  const pickFile = (picked: File | undefined) => {
    if (!picked) return;
    if (!extensions.includes(fileExtension(picked.name))) {
      setProblem(
        `"${
          picked.name
        }" isn't a file type this tool reads. Choose a ${describeKinds(
          fileKinds
        )} file.`
      );
      return;
    }
    if (picked.size > maxMB * 1024 * 1024) {
      setProblem(
        `"${picked.name}" is ${formatBytes(
          picked.size
        )}. This tool takes files up to ${maxMB} MB on this device. Split the file into smaller parts and do each one separately.`
      );
      return;
    }
    if (picked.size === 0) {
      setProblem(
        `"${picked.name}" is empty. Check that you picked the right file.`
      );
      return;
    }
    setProblem(null);
    setFile(picked);
    onChange({kind: "file", file: picked});
  };

  const removeFile = () => {
    setFile(null);
    onChange(null);
  };

  return (
    <div className="tool-source" id={id}>
      {label && <h3 className="tool-source-label">{label}</h3>}
      <div
        className="tool-choice"
        role="group"
        aria-label={`${label ?? "Input"}: paste or open a file`}
      >
        <button
          type="button"
          aria-pressed={mode === "text"}
          onClick={() => switchMode("text")}
        >
          Paste text
        </button>
        <button
          type="button"
          aria-pressed={mode === "file"}
          onClick={() => switchMode("file")}
        >
          Open a file
        </button>
      </div>

      {mode === "text" ? (
        <label className="tool-field">
          <span className="sr-only">{label ? `${label}: text` : "Text"}</span>
          <textarea
            id={`${id}-text`}
            className="tool-textarea"
            value={text}
            placeholder={pastePlaceholder}
            spellCheck={false}
            onChange={e => changeText(e.target.value)}
            rows={8}
          />
        </label>
      ) : file ? (
        <div className="tool-file">
          <i className="fas fa-file-alt" aria-hidden="true"></i>
          <span className="tool-file-name">{file.name}</span>
          <span className="tool-file-size">{formatBytes(file.size)}</span>
          <button
            type="button"
            className="tool-button tool-button-quiet"
            onClick={removeFile}
          >
            Remove
          </button>
        </div>
      ) : (
        <DropZone
          inputId={`${id}-file`}
          accept={extensions}
          multiple={false}
          hint={`${describeKinds(fileKinds)} · up to ${maxMB} MB`}
          onFiles={files => pickFile(files[0])}
        />
      )}
      {problem && <Notice tone="error">{problem}</Notice>}
    </div>
  );
}
