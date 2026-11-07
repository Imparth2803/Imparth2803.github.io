import React, {memo, useEffect, useLayoutEffect, useRef, useState} from "react";
import type {PageItem} from "../logic/pages";
import type {PdfPreviews, Preview} from "./previews";

/* The pages as a grid of cards. Only the rows on (or near) the screen are
   in the page, so even thousands of pages stay quick; every card has the
   same height so the grid knows where each row is. */
const CARD_MIN_WIDTH = 156;
const CARD_HEIGHT = 252;
const GAP = 12;
const ROW = CARD_HEIGHT + GAP;
/** Extra rows kept above and below the screen. */
const BUFFER_ROWS = 2;

export type DropSide = "before" | "after";

export interface CardActions {
  toggle(key: string, range: boolean): void;
  shift(key: string, by: -1 | 1): void;
  turn(key: string, degrees: 90 | -90): void;
  remove(key: string): void;
  dragStart(key: string): void;
  dragEnd(): void;
  /** Drops the dragged pages next to a page, or at the end (key null). */
  drop(key: string | null, side: DropSide): void;
}

export function PageGrid({
  items,
  selected,
  dragging,
  previews,
  sourceName,
  actions
}: {
  items: PageItem[];
  selected: ReadonlySet<string>;
  /** The pages being dragged, if any. */
  dragging: ReadonlySet<string> | null;
  previews: PdfPreviews;
  /** File name to show on each card, or null with only one file. */
  sourceName: (source: number) => string | null;
  actions: CardActions;
}) {
  const gridRef = useRef<HTMLOListElement>(null);
  const [view, setView] = useState({columns: 4, firstRow: 0, lastRow: 6});
  const [target, setTarget] = useState<{key: string; side: DropSide} | null>(
    null
  );

  const rows = Math.ceil(items.length / view.columns);

  // Works out which rows are on screen. Runs after every change (things
  // above the grid can move it) and on scrolling and resizing.
  const itemCount = items.length;
  const measure = useRef(() => {});
  measure.current = () => {
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const columns = Math.max(
      2,
      Math.floor((rect.width + GAP) / (CARD_MIN_WIDTH + GAP))
    );
    const total = Math.ceil(itemCount / columns);
    const above = -rect.top;
    const firstRow = Math.min(
      total,
      Math.max(0, Math.floor(above / ROW) - BUFFER_ROWS)
    );
    const lastRow = Math.min(
      total,
      Math.max(0, Math.ceil((above + window.innerHeight) / ROW) + BUFFER_ROWS)
    );
    setView(old =>
      old.columns === columns &&
      old.firstRow === firstRow &&
      old.lastRow === lastRow
        ? old
        : {columns, firstRow, lastRow}
    );
  };
  useLayoutEffect(() => measure.current());
  useEffect(() => {
    let frame = 0;
    const later = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure.current();
        });
    };
    window.addEventListener("scroll", later, {passive: true});
    window.addEventListener("resize", later);
    return () => {
      window.removeEventListener("scroll", later);
      window.removeEventListener("resize", later);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!dragging) setTarget(null);
  }, [dragging]);

  const first = view.firstRow * view.columns;
  const shown = items.slice(first, view.lastRow * view.columns);

  return (
    <ol
      ref={gridRef}
      className="pdf-grid"
      aria-label="Pages, in their new order"
      style={{
        gridTemplateColumns: `repeat(${view.columns}, minmax(0, 1fr))`,
        gridAutoRows: CARD_HEIGHT,
        gap: GAP,
        height: Math.max(0, rows * ROW - GAP),
        paddingTop: view.firstRow * ROW
      }}
      onDragOver={e => {
        if (dragging) e.preventDefault();
      }}
      onDrop={e => {
        e.preventDefault();
        if (dragging) actions.drop(null, "after");
      }}
    >
      {shown.map((item, n) => (
        <PageCard
          key={item.key}
          item={item}
          position={first + n + 1}
          count={items.length}
          selected={selected.has(item.key)}
          faded={dragging?.has(item.key) ?? false}
          dropSide={target?.key === item.key ? target.side : null}
          sourceName={sourceName(item.source)}
          previews={previews}
          actions={actions}
          dragActive={dragging !== null}
          onTarget={setTarget}
        />
      ))}
    </ol>
  );
}

const PageCard = memo(function PageCard({
  item,
  position,
  count,
  selected,
  faded,
  dropSide,
  sourceName,
  previews,
  actions,
  dragActive,
  onTarget
}: {
  item: PageItem;
  position: number;
  count: number;
  selected: boolean;
  faded: boolean;
  dropSide: DropSide | null;
  sourceName: string | null;
  previews: PdfPreviews;
  actions: CardActions;
  dragActive: boolean;
  onTarget: (target: {key: string; side: DropSide} | null) => void;
}) {
  const [preview, setPreview] = useState<Preview>(null);
  const {key, source, index, turn} = item;

  useEffect(() => {
    setPreview(null);
    return previews.watch(source, index, setPreview);
  }, [previews, source, index]);

  const className = [
    "pdf-page",
    selected && "pdf-page-selected",
    faded && "pdf-page-dragged",
    dropSide && `pdf-page-drop-${dropSide}`
  ]
    .filter(Boolean)
    .join(" ");
  const label = `page ${position}`;

  return (
    <li
      className={className}
      data-key={key}
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", label);
        actions.dragStart(key);
      }}
      onDragEnd={() => actions.dragEnd()}
      onDragOver={e => {
        if (!dragActive) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const side =
          e.clientX < rect.left + rect.width / 2 ? "before" : "after";
        if (dropSide !== side) onTarget({key, side});
      }}
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
        if (dragActive) actions.drop(key, dropSide ?? "before");
      }}
    >
      {/* A plain area, not a button: Firefox won't drag from a button. */}
      <div
        className="pdf-page-thumb"
        onClick={e => actions.toggle(key, e.shiftKey)}
      >
        {preview && preview !== "failed" ? (
          <img
            src={preview.url}
            alt=""
            draggable={false}
            style={turn ? {transform: `rotate(${turn}deg)`} : undefined}
          />
        ) : (
          <span className="pdf-page-placeholder">
            {preview === "failed" ? "No preview" : "Loading…"}
          </span>
        )}
      </div>
      <input
        type="checkbox"
        className="pdf-page-check"
        checked={selected}
        aria-label={`Select ${label}`}
        data-action="select"
        onChange={() => undefined}
        onClick={e => actions.toggle(key, e.shiftKey)}
      />
      <p className="pdf-page-number">
        Page {position}
        <span className="sr-only"> of {count}</span>
      </p>
      <p className="pdf-page-origin">
        {sourceName ? `${sourceName}, ` : "Was "}page {index + 1}
        {turn ? ` · turned ${turn}°` : ""}
      </p>
      <div className="pdf-page-actions">
        <IconButton
          icon="fa-arrow-left"
          label={`Move ${label} left`}
          action="left"
          disabled={position === 1}
          onClick={() => actions.shift(key, -1)}
        />
        <IconButton
          icon="fa-arrow-right"
          label={`Move ${label} right`}
          action="right"
          disabled={position === count}
          onClick={() => actions.shift(key, 1)}
        />
        <IconButton
          icon="fa-undo"
          label={`Turn ${label} anticlockwise`}
          action="turn-left"
          onClick={() => actions.turn(key, -90)}
        />
        <IconButton
          icon="fa-redo"
          label={`Turn ${label} clockwise`}
          action="turn-right"
          onClick={() => actions.turn(key, 90)}
        />
        <IconButton
          icon="fa-trash-alt"
          label={`Remove ${label}`}
          action="remove"
          onClick={() => actions.remove(key)}
        />
      </div>
    </li>
  );
});

function IconButton({
  icon,
  label,
  action,
  disabled,
  onClick
}: {
  icon: string;
  label: string;
  action: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="pdf-icon-button"
      aria-label={label}
      title={label}
      data-action={action}
      disabled={disabled}
      onClick={onClick}
    >
      <i className={`fas ${icon}`} aria-hidden="true" />
    </button>
  );
}
