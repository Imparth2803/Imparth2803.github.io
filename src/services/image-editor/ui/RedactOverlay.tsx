import React, {useRef, useState} from "react";
import {Redaction} from "../logic/edits";
import {Rect, Size} from "../logic/geometry";
import {BoxEditor} from "./BoxEditor";

const MIN_SCREEN_PX = 8;

/* The hidden areas over the preview: drag on the picture to draw a new
   one; each area is a box that can be moved, resized and deleted. Areas
   are kept as shares of the image, and shown in image pixels here. */
export function RedactOverlay({
  redactions,
  imageSize,
  scale,
  onDraw,
  onChange,
  onPreview
}: {
  redactions: Redaction[];
  /** The image at this step (after crop), in full-size pixels. */
  imageSize: Size;
  /** Screen pixels per image pixel. */
  scale: number;
  onDraw: (area: Pick<Redaction, "x" | "y" | "w" | "h">) => void;
  onChange: (redactions: Redaction[]) => void;
  onPreview: (redactions: Redaction[]) => void;
}) {
  const {width: W, height: H} = imageSize;
  const toRect = (r: Redaction): Rect => ({
    x: Math.round(r.x * W),
    y: Math.round(r.y * H),
    width: Math.max(1, Math.round(r.w * W)),
    height: Math.max(1, Math.round(r.h * H))
  });
  const toShare = (box: Rect) => ({
    x: box.x / W,
    y: box.y / H,
    w: box.width / W,
    h: box.height / H
  });

  const start = useRef<{x: number; y: number} | null>(null);
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const local = (e: React.PointerEvent<HTMLDivElement>) => {
    const at = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(W, Math.max(0, (e.clientX - at.left) / scale)),
      y: Math.min(H, Math.max(0, (e.clientY - at.top) / scale))
    };
  };
  const span = (a: {x: number; y: number}, b: {x: number; y: number}) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  });

  return (
    <>
      <div
        className="editor-draw-surface"
        aria-hidden="true"
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = local(e);
        }}
        onPointerMove={e => {
          if (start.current) setDrawing(span(start.current, local(e)));
        }}
        onPointerUp={e => {
          const from = start.current;
          start.current = null;
          setDrawing(null);
          if (!from) return;
          const box = span(from, local(e));
          if (
            box.width * scale >= MIN_SCREEN_PX &&
            box.height * scale >= MIN_SCREEN_PX
          ) {
            onDraw(toShare(box));
          }
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrawing(null);
        }}
      >
        {drawing && (
          <div
            className="editor-draw-preview"
            style={{
              left: drawing.x * scale,
              top: drawing.y * scale,
              width: drawing.width * scale,
              height: drawing.height * scale
            }}
          />
        )}
      </div>
      {redactions.map((r, i) => (
        <BoxEditor
          key={r.id}
          box={toRect(r)}
          imageSize={imageSize}
          scale={scale}
          dim={false}
          ariaLabel={`Hidden area ${i + 1}`}
          onChange={(box, final) =>
            (final ? onChange : onPreview)(
              redactions.map(x => (x.id === r.id ? {...x, ...toShare(box)} : x))
            )
          }
          onDelete={() => onChange(redactions.filter(x => x.id !== r.id))}
        />
      ))}
    </>
  );
}
