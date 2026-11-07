import React, {useState} from "react";
import {copyBlobText} from "../files/download";

export interface DownloadAction {
  label: string;
  run: () => Promise<void> | void;
}

/* Copy and download buttons for a result, with plain feedback. */
export function ResultActions({
  copy,
  downloads,
  run
}: {
  /** The text to copy, already prepared (copying must start straight from the click). */
  copy?: Blob;
  downloads: DownloadAction[];
  /** Runs a download through the page's task runner (busy state, errors). */
  run: (
    label: string,
    work: () => Promise<void>,
    fallback?: string
  ) => Promise<unknown>;
}) {
  const [copied, setCopied] = useState(false);

  const doCopy = () => {
    if (!copy) return;
    setCopied(false);
    run(
      "Copying…",
      async () => {
        await copyBlobText(copy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      },
      "Copying didn't work in this browser. Use Download instead."
    );
  };

  return (
    <div className="tool-actions-row">
      {copy && (
        <button
          type="button"
          className="tool-button tool-button-primary"
          onClick={doCopy}
        >
          <i className="fas fa-copy" aria-hidden="true"></i>{" "}
          {copied ? "Copied" : "Copy"}
        </button>
      )}
      {downloads.map(action => (
        <button
          key={action.label}
          type="button"
          className="tool-button"
          onClick={() => run("Preparing your file…", async () => action.run())}
        >
          <i className="fas fa-download" aria-hidden="true"></i> {action.label}
        </button>
      ))}
      <span className="sr-only" role="status">
        {copied ? "Copied to the clipboard" : ""}
      </span>
    </div>
  );
}
