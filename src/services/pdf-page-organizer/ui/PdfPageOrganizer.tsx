import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import "../../../shared/ui/Tool.scss";
import "./PdfPageOrganizer.scss";
import {baseName, downloadBlob} from "../../../shared/files/download";
import {
  fileLimitMB,
  formatBytes,
  isSmallDevice,
  PdfLimits
} from "../../../shared/limits";
import {formatCount} from "../../../shared/text/numbers";
import {DropZone} from "../../../shared/ui/DropZone";
import {ActionBar, Notice, ToolStep} from "../../../shared/ui/ToolStep";
import {useTask} from "../../../shared/ui/useTask";
import {useWorker} from "../../../shared/ui/useWorker";
import {CancelledError, ToolError} from "../../../shared/worker/WorkerClient";
import {
  describeOrder,
  duplicatePages,
  keysBetween,
  movePages,
  PageItem,
  pagesOf,
  removePages,
  shiftPage,
  turnPages
} from "../logic/pages";
import type {PdfPageOrganizerApi} from "../worker/pdfPageOrganizer.worker";
import {CardActions, DropSide, PageGrid} from "./PageGrid";
import {PdfPreviews} from "./previews";

const createWorker = () =>
  new Worker(new URL("../worker/pdfPageOrganizer.worker.ts", import.meta.url));

const MB = 1024 * 1024;
const MAX_UNDO = 100;

interface Source {
  id: number;
  file: File;
  pageCount: number;
}

interface Pages {
  items: PageItem[];
  /** Earlier lists, newest last, for Undo. */
  history: PageItem[][];
}

let nextSourceId = 1;

export default function PdfPageOrganizer({limits}: {limits: PdfLimits}) {
  const small = isSmallDevice();
  const maxFiles = small ? limits.maxFilesMobile : limits.maxFiles;
  const maxFileMB = fileLimitMB(limits);
  const maxTotalMB = small ? limits.maxTotalMBMobile : limits.maxTotalMB;
  const maxPages = small ? limits.maxPagesMobile : limits.maxPages;

  const worker = useWorker<PdfPageOrganizerApi>(createWorker);
  const [previews, setPreviews] = useState(() => new PdfPreviews());
  useEffect(() => () => previews.dispose(), [previews]);
  const task = useTask();

  const [sources, setSources] = useState<Source[]>([]);
  const [pages, setPages] = useState<Pages>({items: [], history: []});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [dragging, setDragging] = useState<ReadonlySet<string> | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const focusAfter = useRef<{key: string; action: string} | null>(null);

  const {items} = pages;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  /** Changes the page list, keeping the old one for Undo. */
  const change = useCallback((next: (items: PageItem[]) => PageItem[]) => {
    setPages(old => {
      const items = next(old.items);
      if (items === old.items) return old;
      return {items, history: [...old.history, old.items].slice(-MAX_UNDO)};
    });
    setSaved(null);
  }, []);

  // Selected pages that were removed are no longer selected.
  useEffect(() => {
    setSelected(old => {
      const keys = new Set(items.map(item => item.key));
      const kept = Array.from(old).filter(key => keys.has(key));
      return kept.length === old.size ? old : new Set(kept);
    });
  }, [items]);

  // After moving a page with its buttons, keep the keyboard focus on it.
  useEffect(() => {
    const want = focusAfter.current;
    if (!want) return;
    focusAfter.current = null;
    const card = document.querySelector(`[data-key="${want.key}"]`);
    const button =
      card?.querySelector<HTMLButtonElement>(
        `[data-action="${want.action}"]:not(:disabled)`
      ) ?? card?.querySelector<HTMLButtonElement>('[data-action="select"]');
    button?.focus();
  });

  // Names shown on each card; only needed with more than one file.
  const names = useMemo(() => {
    const map = new Map<number, string>();
    const used = new Map<string, number>();
    sources.forEach(source => {
      const n = (used.get(source.file.name) ?? 0) + 1;
      used.set(source.file.name, n);
      map.set(
        source.id,
        n === 1 ? source.file.name : `${source.file.name} (${n})`
      );
    });
    return map;
  }, [sources]);
  const sourceName = useCallback(
    (source: number) => (names.size > 1 ? names.get(source) ?? "" : null),
    [names]
  );

  const add = async (files: File[]) => {
    setChecking(true);
    setSaved(null);
    const found: string[] = [];
    const added: Source[] = [];
    let totalBytes = sources.reduce((sum, s) => sum + s.file.size, 0);
    let totalPages = sources.reduce((sum, s) => sum + s.pageCount, 0);
    for (const file of files) {
      if (sources.length + added.length >= maxFiles) {
        found.push(
          `Only ${maxFiles} PDFs can be open at once on this device, so the rest weren't added. Save this PDF first, then start again with the rest.`
        );
        break;
      }
      if (file.size > maxFileMB * MB) {
        found.push(
          `“${file.name}” is ${formatBytes(
            file.size
          )}; this device can handle PDFs up to ${maxFileMB} MB. Try splitting it into smaller files first.`
        );
        continue;
      }
      if (totalBytes + file.size > maxTotalMB * MB) {
        found.push(
          `“${file.name}” wasn't added: together the PDFs would be over ${maxTotalMB} MB, the most this device can handle at once. Save what you have first, then add the rest.`
        );
        continue;
      }
      let pageCount: number;
      try {
        ({pageCount} = await worker.call("inspect", file));
      } catch (error) {
        if (error instanceof CancelledError) break;
        found.push(
          error instanceof ToolError
            ? error.message
            : `“${file.name}” couldn't be read.`
        );
        continue;
      }
      if (totalPages + pageCount > maxPages) {
        found.push(
          `“${file.name}” has ${formatCount(
            pageCount
          )} pages; together that would be over ${formatCount(
            maxPages
          )} pages, the most this device can handle at once.`
        );
        continue;
      }
      const source = {id: nextSourceId++, file, pageCount};
      previews.open(source.id, file);
      added.push(source);
      totalBytes += file.size;
      totalPages += pageCount;
    }
    setProblems(found);
    setChecking(false);
    if (added.length) {
      setSources(old => [...old, ...added]);
      const newItems = added.flatMap(s => pagesOf(s.id, s.pageCount));
      change(old => [...old, ...newItems]);
      setAnnouncement(
        `${formatCount(newItems.length)} ${
          newItems.length === 1 ? "page" : "pages"
        } added.`
      );
    }
  };

  const removeSource = (id: number) => {
    previews.close(id);
    setSources(old => old.filter(s => s.id !== id));
    // The file's pages go, and Undo can't bring them back.
    setPages(old => ({
      items: old.items.filter(item => item.source !== id),
      history: old.history.map(list => list.filter(i => i.source !== id))
    }));
    setSaved(null);
  };

  const actions: CardActions = useMemo(
    () => ({
      toggle(key, range) {
        setSelected(old => {
          const next = new Set(old);
          if (range && anchorRef.current) {
            keysBetween(itemsRef.current, anchorRef.current, key).forEach(k =>
              next.add(k)
            );
          } else if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        setAnchor(key);
      },
      shift(key, by) {
        const from = positionIn(itemsRef.current, key);
        change(old => shiftPage(old, key, by));
        focusAfter.current = {key, action: by < 0 ? "left" : "right"};
        setAnnouncement(`Page ${from} moved to position ${from + by}.`);
      },
      turn(key, degrees) {
        change(old => turnPages(old, new Set([key]), degrees));
        setAnnouncement(
          `Page ${positionIn(itemsRef.current, key)} turned ${
            degrees > 0 ? "clockwise" : "anticlockwise"
          }.`
        );
      },
      remove(key) {
        const at = positionIn(itemsRef.current, key);
        change(old => removePages(old, new Set([key])));
        setAnnouncement(`Page ${at} removed. Use Undo to bring it back.`);
        // Focus the page that takes its place, if any.
        const next = itemsRef.current[at] ?? itemsRef.current[at - 2];
        if (next) focusAfter.current = {key: next.key, action: "remove"};
      },
      dragStart(key) {
        const chosen = selectedRef.current;
        setDragging(chosen.has(key) ? chosen : new Set([key]));
      },
      dragEnd() {
        setDragging(null);
      },
      drop(key, side) {
        const moving = draggingRef.current;
        setDragging(null);
        if (!moving) return;
        change(old =>
          movePages(old, moving, beforeKey(old, moving, key, side))
        );
        setAnnouncement(
          `${moving.size === 1 ? "Page" : `${moving.size} pages`} moved.`
        );
      }
    }),
    [change]
  );

  const selectedInOrder = items.filter(item => selected.has(item.key));

  const onSelected = (
    label: string,
    next: (items: PageItem[]) => PageItem[]
  ) => {
    change(next);
    setAnnouncement(label);
  };

  const moveSelected = () => {
    const position = parseInt(moveTo, 10);
    if (!Number.isFinite(position) || position < 1) return;
    onSelected(
      `${selected.size === 1 ? "Page" : `${selected.size} pages`} moved.`,
      old => {
        const rest = old.filter(item => !selected.has(item.key));
        return movePages(old, selected, rest[position - 1]?.key ?? null);
      }
    );
  };

  const save = (list: PageItem[], fileName: string) =>
    task.run("Making your PDF…", async () => {
      const blob = await worker.call("build", {
        sources: sources.map(({id, file}) => ({id, file})),
        pages: list.map(({source, index, turn}) => ({source, index, turn}))
      });
      downloadBlob(blob, fileName);
      setSaved(
        `“${fileName}” was saved: ${formatCount(list.length)} ${
          list.length === 1 ? "page" : "pages"
        }, ${formatBytes(blob.size)}.`
      );
    });

  const outputBase =
    sources.length === 1 ? baseName(sources[0]!.file.name) : "combined";

  const reset = () => {
    worker.cancel();
    setPreviews(new PdfPreviews()); // The old one is closed by the effect.
    setSources([]);
    setPages({items: [], history: []});
    setSelected(new Set());
    setProblems([]);
    setSaved(null);
    setMoveTo("");
    task.setError(null);
  };

  const totalBytes = sources.reduce((sum, s) => sum + s.file.size, 0);
  const order = describeOrder(items, source => names.get(source) ?? "");

  return (
    <div className="tool">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <ToolStep step={1} title="Add your PDFs">
        <div className="tool-source" id="pdf-input">
          <DropZone
            inputId="pdf-input-files"
            accept={["pdf"]}
            multiple
            hint={`PDF · add more than one to combine them · up to ${maxFileMB} MB each, ${maxTotalMB} MB in total`}
            onFiles={files => void add(files)}
          />
          {checking && (
            <p className="tool-muted" role="status">
              Checking the files…
            </p>
          )}
          {problems.length > 0 && (
            <Notice tone="error">
              <p>
                {problems.length === 1
                  ? "One file wasn't added:"
                  : "Some files weren't added:"}
              </p>
              <ul className="tool-list">
                {problems.map(problem => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Notice>
          )}
          {sources.length > 0 && (
            <ul className="pdf-files">
              {sources.map(source => (
                <li key={source.id} className="tool-file">
                  <i className="fas fa-file-pdf" aria-hidden="true"></i>
                  <span className="tool-file-name">{names.get(source.id)}</span>
                  <span className="tool-file-size">
                    {formatCount(source.pageCount)}{" "}
                    {source.pageCount === 1 ? "page" : "pages"} ·{" "}
                    {formatBytes(source.file.size)}
                  </span>
                  <button
                    type="button"
                    className="tool-button tool-button-quiet"
                    aria-label={`Remove ${names.get(source.id)}`}
                    onClick={() => removeSource(source.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {sources.length > 1 && (
            <p className="tool-muted">
              The pages of each PDF are added after the ones before, so all{" "}
              {sources.length} files ({formatBytes(totalBytes)}) become one PDF.
            </p>
          )}
        </div>
      </ToolStep>

      <ToolStep
        step={2}
        title="Arrange the pages"
        aside={
          items.length > 0 && (
            <button
              type="button"
              className="tool-button"
              disabled={pages.history.length === 0}
              onClick={() => {
                setPages(old =>
                  old.history.length
                    ? {
                        items: old.history[old.history.length - 1]!,
                        history: old.history.slice(0, -1)
                      }
                    : old
                );
                setSaved(null);
                setAnnouncement("Last change undone.");
              }}
            >
              <i className="fas fa-undo" aria-hidden="true"></i> Undo
            </button>
          )
        }
      >
        {sources.length === 0 ? (
          <p className="tool-muted">Add a PDF first.</p>
        ) : (
          <>
            <p className="tool-field-hint pdf-help">
              Drag a page to move it, or use its arrow buttons. Click pages to
              select them (hold Shift to select a run of pages), then change
              them all at once.
            </p>
            <div className="pdf-toolbar">
              <div className="tool-actions-row">
                <span className="tool-muted pdf-count">
                  {selected.size > 0
                    ? `${formatCount(selected.size)} of ${formatCount(
                        items.length
                      )} pages selected`
                    : `${formatCount(items.length)} ${
                        items.length === 1 ? "page" : "pages"
                      }`}
                </span>
                <button
                  type="button"
                  className="tool-button"
                  disabled={items.length === 0}
                  onClick={() => setSelected(new Set(items.map(i => i.key)))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="tool-button"
                  disabled={selected.size === 0}
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </button>
              </div>
              {selected.size > 0 && (
                <div
                  className="tool-actions-row"
                  role="group"
                  aria-label="Change the selected pages"
                >
                  <button
                    type="button"
                    className="tool-button"
                    onClick={() =>
                      onSelected("Selected pages turned anticlockwise.", old =>
                        turnPages(old, selected, -90)
                      )
                    }
                  >
                    <i className="fas fa-undo" aria-hidden="true"></i> Turn
                    anticlockwise
                  </button>
                  <button
                    type="button"
                    className="tool-button"
                    onClick={() =>
                      onSelected("Selected pages turned clockwise.", old =>
                        turnPages(old, selected, 90)
                      )
                    }
                  >
                    <i className="fas fa-redo" aria-hidden="true"></i> Turn
                    clockwise
                  </button>
                  <button
                    type="button"
                    className="tool-button"
                    onClick={() =>
                      onSelected(
                        "Each selected page now has a copy straight after it.",
                        old => duplicatePages(old, selected)
                      )
                    }
                  >
                    <i className="fas fa-clone" aria-hidden="true"></i>{" "}
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="tool-button"
                    onClick={() =>
                      onSelected(
                        "Selected pages removed. Use Undo to bring them back.",
                        old => removePages(old, selected)
                      )
                    }
                  >
                    <i className="fas fa-trash-alt" aria-hidden="true"></i>{" "}
                    Remove
                  </button>
                  <form
                    className="pdf-move-to"
                    onSubmit={e => {
                      e.preventDefault();
                      moveSelected();
                    }}
                  >
                    <label htmlFor="pdf-move-to">Move to position</label>
                    <input
                      id="pdf-move-to"
                      className="tool-input tool-input-short"
                      inputMode="numeric"
                      value={moveTo}
                      onChange={e =>
                        setMoveTo(e.target.value.replace(/\D/g, ""))
                      }
                    />
                    <button
                      type="submit"
                      className="tool-button"
                      disabled={!moveTo}
                    >
                      Move
                    </button>
                  </form>
                  <button
                    type="button"
                    className="tool-button tool-button-primary"
                    disabled={task.busy !== null}
                    onClick={() =>
                      save(selectedInOrder, `${outputBase}-selected-pages.pdf`)
                    }
                  >
                    <i className="fas fa-file-export" aria-hidden="true"></i>{" "}
                    Save selected pages as a new PDF
                  </button>
                </div>
              )}
            </div>
            {items.length === 0 ? (
              <Notice tone="info">
                There are no pages left. Use Undo, or add a PDF.
              </Notice>
            ) : (
              <PageGrid
                items={items}
                selected={selected}
                dragging={dragging}
                previews={previews}
                sourceName={sourceName}
                actions={actions}
              />
            )}
          </>
        )}
      </ToolStep>

      <ToolStep step={3} title="Save the new PDF">
        {items.length > 0 && (
          <div className="pdf-order">
            <p className="tool-field-label">
              New order ({formatCount(items.length)}{" "}
              {items.length === 1 ? "page" : "pages"})
            </p>
            <ol className="tool-list">
              {order.map((part, i) => (
                <li key={i}>{part}</li>
              ))}
            </ol>
          </div>
        )}
        <ActionBar
          label="Save PDF"
          busyLabel={task.busy}
          disabled={items.length === 0}
          onRun={() => void save(items, `${outputBase}-organized.pdf`)}
          onCancel={() => worker.cancel()}
          onReset={reset}
        />
        {items.length === 0 && sources.length === 0 && (
          <p className="tool-muted">Add a PDF first.</p>
        )}
        {saved && <Notice tone="success">{saved}</Notice>}
        {task.error && <Notice tone="error">{task.error}</Notice>}
        <p className="tool-field-hint">
          Pages are copied exactly as they are, so text stays sharp and can
          still be searched and copied. Bookmarks and fillable form fields
          aren't carried over.
        </p>
      </ToolStep>
    </div>
  );
}

/** A page's place in the list, from 1. */
function positionIn(items: PageItem[], key: string): number {
  return items.findIndex(item => item.key === key) + 1;
}

/** Where dropped pages go: before the page they were dropped on, or before
    the next page that isn't moving (null means the end). */
function beforeKey(
  items: PageItem[],
  moving: ReadonlySet<string>,
  key: string | null,
  side: DropSide
): string | null {
  if (key === null) return null;
  const at = items.findIndex(item => item.key === key);
  if (at === -1) return null;
  const from = side === "before" ? at : at + 1;
  for (let i = from; i < items.length; i++) {
    if (!moving.has(items[i]!.key)) return items[i]!.key;
  }
  return null;
}
