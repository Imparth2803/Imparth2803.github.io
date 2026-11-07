import React, {useCallback, useEffect, useRef, useState} from "react";
import {CancelledError, ToolError} from "../../../shared/worker/WorkerClient";
import type {WorkerClient} from "../../../shared/worker/WorkerClient";
import type {Edits} from "../logic/edits";
import type {ImageEditorApi} from "../worker/imageEditor.worker";

/* The middle of the editor: the preview on a checkerboard (so see-through
   areas show), with zoom. The preview is drawn in the worker at about
   screen size, never bigger than needed, and only the latest request is
   drawn when changes come quickly (for example while dragging a slider). */

export const ZOOM_STEPS = [10, 25, 33, 50, 67, 100, 150, 200, 300, 400];
/** Longest side of a preview, in pixels. */
const MAX_PREVIEW = 4096;

export type Zoom = "fit" | number;

interface Job {
  edits: Edits;
  scale: number;
  cssWidth: number;
  cssHeight: number;
}

export function Workspace({
  client,
  edits,
  width,
  height,
  zoom,
  onFitScale,
  onBusy,
  children
}: {
  client: WorkerClient<ImageEditorApi>;
  edits: Edits;
  /** Size of the result at full size. */
  width: number;
  height: number;
  zoom: Zoom;
  /** Reports the zoom that fits the image on screen. */
  onFitScale: (scale: number) => void;
  onBusy: (busy: boolean) => void;
  children?: React.ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [space, setSpace] = useState({width: 800, height: 600});
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Job | null>(null);
  const running = useRef(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () =>
      setSpace(old =>
        old.width === stage.clientWidth && old.height === stage.clientHeight
          ? old
          : {width: stage.clientWidth, height: stage.clientHeight}
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const fit = Math.min(
    1,
    (space.width - 32) / width,
    (space.height - 32) / height
  );
  useEffect(() => onFitScale(fit), [fit, onFitScale]);
  const display = zoom === "fit" ? fit : zoom / 100;
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(
    1,
    display * dpr,
    MAX_PREVIEW / Math.max(width, height)
  );

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    onBusy(true);
    while (pending.current) {
      const job = pending.current;
      pending.current = null;
      try {
        const {bitmap} = await client.call("render", {
          edits: job.edits,
          scale: job.scale
        });
        const canvas = canvasRef.current;
        if (!canvas) {
          bitmap.close();
          break;
        }
        // Size and picture change together, so nothing looks stretched.
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.style.width = `${job.cssWidth}px`;
        canvas.style.height = `${job.cssHeight}px`;
        canvas.getContext("bitmaprenderer")!.transferFromImageBitmap(bitmap);
        setError(null);
      } catch (e) {
        if (e instanceof CancelledError) break;
        setError(
          e instanceof ToolError
            ? e.message
            : "The preview couldn't be drawn. Try undoing the last change."
        );
      }
    }
    running.current = false;
    onBusy(false);
  }, [client, onBusy]);

  useEffect(() => {
    pending.current = {
      edits,
      scale,
      cssWidth: Math.max(1, Math.round(width * display)),
      cssHeight: Math.max(1, Math.round(height * display))
    };
    void pump();
  }, [edits, scale, width, height, display, pump]);

  const cssW = Math.max(1, Math.round(width * display));
  const cssH = Math.max(1, Math.round(height * display));

  return (
    <div
      ref={stageRef}
      className="editor-stage"
      tabIndex={0}
      aria-label="Image preview. Use the arrow keys to scroll when zoomed in."
    >
      <div
        className="editor-canvas-wrap"
        style={{
          width: `${cssW}px`,
          height: `${cssH}px`
        }}
      >
        <canvas ref={canvasRef} className="editor-canvas" />
        {children}
      </div>
      {error && (
        <p className="editor-stage-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
