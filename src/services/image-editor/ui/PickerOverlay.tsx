import React, {useEffect, useRef, useState} from "react";
import type {Rgba} from "../logic/colour";
import {Size, toImage} from "../logic/geometry";

export interface Sample {
  x: number;
  y: number;
  rgba: Rgba;
  patch: Uint8ClampedArray;
}

const ZOOM = 8;
const PATCH = 11;

/* Over the preview while the colour picker is open: moving the pointer
   shows a magnified view of the pixels under it, and clicking (or tapping)
   picks the colour. With the keyboard, the arrow keys move a cross (Shift
   for 10 pixels) and Enter picks. */
export function PickerOverlay({
  imageSize,
  scale,
  sample,
  onPick
}: {
  /** The edited image, in full-size pixels. */
  imageSize: Size;
  /** Screen pixels per image pixel. */
  scale: number;
  sample: (x: number, y: number) => Promise<Sample>;
  onPick: (s: Sample) => void;
}) {
  const [shown, setShown] = useState<Sample | null>(null);
  const [cross, setCross] = useState({
    x: Math.floor(imageSize.width / 2),
    y: Math.floor(imageSize.height / 2)
  });
  const busy = useRef(false);
  const want = useRef<{x: number; y: number} | null>(null);
  const lens = useRef<HTMLCanvasElement>(null);

  // Only one sample is asked for at a time; the latest position wins.
  const look = async (x: number, y: number) => {
    want.current = {x, y};
    if (busy.current) return;
    busy.current = true;
    try {
      while (want.current) {
        const at = want.current;
        want.current = null;
        setShown(await sample(at.x, at.y));
      }
    } catch {
      // The picker closed while sampling.
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    const canvas = lens.current;
    if (!canvas || !shown) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const small = document.createElement("canvas");
    small.width = small.height = PATCH;
    small
      .getContext("2d")!
      .putImageData(
        new ImageData(new Uint8ClampedArray(shown.patch), PATCH, PATCH),
        0,
        0
      );
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, PATCH * ZOOM, PATCH * ZOOM);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(5 * ZOOM, 5 * ZOOM, ZOOM, ZOOM);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.strokeRect(5 * ZOOM - 1.5, 5 * ZOOM - 1.5, ZOOM + 3, ZOOM + 3);
  }, [shown]);

  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const [x, y] = toImage(
      [e.clientX - box.left, e.clientY - box.top],
      {width: box.width, height: box.height},
      imageSize
    );
    return {
      x: Math.min(imageSize.width - 1, Math.max(0, Math.floor(x))),
      y: Math.min(imageSize.height - 1, Math.max(0, Math.floor(y)))
    };
  };

  const pick = async (x: number, y: number) => {
    try {
      const s = await sample(x, y);
      setShown(s);
      onPick(s);
    } catch {
      // The picker closed.
    }
  };

  const lensAt = shown ?? null;
  return (
    <div
      className="editor-picker-surface"
      role="application"
      tabIndex={0}
      aria-label="Colour picker. Click a pixel, or move the cross with the arrow keys and press Enter."
      onPointerMove={e => {
        const p = at(e);
        void look(p.x, p.y);
      }}
      onPointerLeave={() => setShown(null)}
      onClick={e => {
        const box = e.currentTarget.getBoundingClientRect();
        const [x, y] = toImage(
          [e.clientX - box.left, e.clientY - box.top],
          {width: box.width, height: box.height},
          imageSize
        );
        void pick(
          Math.min(imageSize.width - 1, Math.max(0, Math.floor(x))),
          Math.min(imageSize.height - 1, Math.max(0, Math.floor(y)))
        );
      }}
      onKeyDown={e => {
        const step = e.shiftKey ? 10 : 1;
        const move: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step]
        };
        if (move[e.key]) {
          e.preventDefault();
          const [dx, dy] = move[e.key]!;
          const next = {
            x: Math.min(imageSize.width - 1, Math.max(0, cross.x + dx)),
            y: Math.min(imageSize.height - 1, Math.max(0, cross.y + dy))
          };
          setCross(next);
          void look(next.x, next.y);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void pick(cross.x, cross.y);
        }
      }}
      onFocus={() => void look(cross.x, cross.y)}
    >
      <span
        className="editor-picker-cross"
        aria-hidden="true"
        style={{left: (cross.x + 0.5) * scale, top: (cross.y + 0.5) * scale}}
      />
      {lensAt && (
        <canvas
          ref={lens}
          className="editor-picker-lens"
          aria-hidden="true"
          width={PATCH * ZOOM}
          height={PATCH * ZOOM}
          style={{
            left: (lensAt.x + 0.5) * scale + 16,
            top: (lensAt.y + 0.5) * scale + 16
          }}
        />
      )}
    </div>
  );
}
