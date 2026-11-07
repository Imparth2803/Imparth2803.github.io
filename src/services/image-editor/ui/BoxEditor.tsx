import React, {useCallback, useRef} from "react";
import {Handle, Rect, resizeBox, Size} from "../logic/geometry";

export interface BoxEditorProps {
  /** The box in full-size image pixels (integer coordinates). */
  box: Rect;
  /** Bounds of the underlying image in full-size image pixels. */
  imageSize: Size;
  /** Display scale (screen pixels per image pixel). */
  scale: number;
  /** Aspect ratio lock (width / height), or null for free aspect ratio. */
  aspectRatio?: number | null;
  /** Shape to render ("rect" | "circle"). */
  shape?: "rect" | "circle";
  /** Accessible label (e.g. "Crop area"). */
  ariaLabel: string;
  /** Called when box position or size changes. `final` is false while a
      drag is still going on, and true when it ends (or for a key press). */
  onChange: (box: Rect, final: boolean) => void;
  /** Called when Delete or Backspace is pressed. */
  onDelete?: () => void;
  disabled?: boolean;
  /** False: the box can only be moved, not resized. */
  resizable?: boolean;
  /** Image pixels moved per arrow key press (10 times as far with Shift). */
  nudge?: number;
  /** False: don't darken the image outside the box. */
  dim?: boolean;
}

const HANDLES: {id: Handle; cursor: string; className: string}[] = [
  {id: "top-left", cursor: "nwse-resize", className: "editor-handle-nw"},
  {id: "top", cursor: "ns-resize", className: "editor-handle-n"},
  {id: "top-right", cursor: "nesw-resize", className: "editor-handle-ne"},
  {id: "right", cursor: "ew-resize", className: "editor-handle-e"},
  {id: "bottom-right", cursor: "nwse-resize", className: "editor-handle-se"},
  {id: "bottom", cursor: "ns-resize", className: "editor-handle-s"},
  {id: "bottom-left", cursor: "nesw-resize", className: "editor-handle-sw"},
  {id: "left", cursor: "ew-resize", className: "editor-handle-w"}
];

export function BoxEditor({
  box,
  imageSize,
  scale,
  aspectRatio = null,
  shape = "rect",
  ariaLabel,
  onChange,
  onDelete,
  disabled = false,
  resizable = true,
  nudge = 1,
  dim = true
}: BoxEditorProps) {
  const dragRef = useRef<{
    mode: "move" | Handle;
    startClientX: number;
    startClientY: number;
    startBox: Rect;
    last: Rect | null;
  } | null>(null);

  const minScreenPx = 8;
  const minImgPx = Math.max(1, Math.ceil(minScreenPx / Math.max(scale, 0.001)));

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, mode: "move" | Handle) => {
      if (disabled || e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        mode,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startBox: {...box},
        last: null
      };
    },
    [disabled, box]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current || scale <= 0) return;
      e.stopPropagation();
      const {mode, startClientX, startClientY, startBox} = dragRef.current;
      const dx = (e.clientX - startClientX) / scale;
      const dy = (e.clientY - startClientY) / scale;

      if (mode === "move") {
        const nextX = Math.round(startBox.x + dx);
        const nextY = Math.round(startBox.y + dy);
        const clampedX = Math.max(
          0,
          Math.min(imageSize.width - startBox.width, nextX)
        );
        const clampedY = Math.max(
          0,
          Math.min(imageSize.height - startBox.height, nextY)
        );
        const moved = {
          x: clampedX,
          y: clampedY,
          width: startBox.width,
          height: startBox.height
        };
        dragRef.current.last = moved;
        onChange(moved, false);
        return;
      }

      const resized = resizeBox(
        startBox,
        mode,
        dx,
        dy,
        imageSize,
        aspectRatio,
        minImgPx
      );
      dragRef.current.last = resized;
      onChange(resized, false);
    },
    [scale, minImgPx, imageSize, aspectRatio, onChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (dragRef.current) {
        e.stopPropagation();
        const {last} = dragRef.current;
        if (last) onChange(last, true);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // Ignored if already released
        }
        dragRef.current = null;
      }
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (onDelete) {
          e.preventDefault();
          onDelete();
        }
        return;
      }

      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * nudge;
        if (e.altKey && resizable) {
          // Alt+Arrow resizes bottom-right
          let dw = 0;
          let dh = 0;
          if (e.key === "ArrowRight") dw = step;
          if (e.key === "ArrowLeft") dw = -step;
          if (e.key === "ArrowDown") dh = step;
          if (e.key === "ArrowUp") dh = -step;

          onChange(
            resizeBox(
              box,
              "bottom-right",
              dw,
              dh,
              imageSize,
              aspectRatio,
              minImgPx
            ),
            true
          );
        } else {
          // Arrow moves
          let dx = 0;
          let dy = 0;
          if (e.key === "ArrowRight") dx = step;
          if (e.key === "ArrowLeft") dx = -step;
          if (e.key === "ArrowDown") dy = step;
          if (e.key === "ArrowUp") dy = -step;

          const clampedX = Math.max(
            0,
            Math.min(imageSize.width - box.width, box.x + dx)
          );
          const clampedY = Math.max(
            0,
            Math.min(imageSize.height - box.height, box.y + dy)
          );
          onChange({...box, x: clampedX, y: clampedY}, true);
        }
      }
    },
    [
      disabled,
      onDelete,
      minImgPx,
      box,
      aspectRatio,
      imageSize,
      onChange,
      nudge,
      resizable
    ]
  );

  const screenLeft = Math.round(box.x * scale);
  const screenTop = Math.round(box.y * scale);
  const screenWidth = Math.max(minScreenPx, Math.round(box.width * scale));
  const screenHeight = Math.max(minScreenPx, Math.round(box.height * scale));

  return (
    <div
      className="editor-box-overlay"
      style={{touchAction: "none"}}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className={[
          "editor-box",
          shape === "circle" && "editor-box-circle",
          !dim && "editor-box-plain"
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          left: `${screenLeft}px`,
          top: `${screenTop}px`,
          width: `${screenWidth}px`,
          height: `${screenHeight}px`
        }}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        onPointerDown={e => handlePointerDown(e, "move")}
        onKeyDown={handleKeyDown}
      >
        {shape === "rect" && dim && (
          <div className="editor-box-grid" aria-hidden="true">
            <span className="grid-h grid-h1" />
            <span className="grid-h grid-h2" />
            <span className="grid-v grid-v1" />
            <span className="grid-v grid-v2" />
          </div>
        )}
        {!disabled &&
          resizable &&
          HANDLES.map(h => (
            <div
              key={h.id}
              className={`editor-box-handle ${h.className}`}
              style={{cursor: h.cursor}}
              onPointerDown={e => handlePointerDown(e, h.id)}
              aria-hidden="true"
            />
          ))}
      </div>
    </div>
  );
}
