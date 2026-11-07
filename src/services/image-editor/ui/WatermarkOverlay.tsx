import React from "react";
import {Size} from "../logic/geometry";
import {
  fontFor,
  fontPx,
  itemSize,
  lineOf,
  placeCentre,
  turnedBounds,
  Watermark
} from "../logic/watermark";
import {BoxEditor} from "./BoxEditor";
import {LogoInfo} from "./WatermarkPanel";

let measurer: CanvasRenderingContext2D | null = null;
/** The text's width, measured the same way the worker measures it. */
function textWidth(w: Watermark, image: Size) {
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return 0;
  measurer.font = fontFor(w, fontPx(w, image));
  return measurer.measureText(lineOf(w.text)).width;
}

/* A box around a single watermark, so it can be dragged (or moved with the
   arrow keys). Dragging places it "where I dragged it", kept as a share of
   the image so it stays put if the image is resized. */
export function WatermarkOverlay({
  watermark: w,
  imageSize,
  scale,
  logo,
  onChange,
  onPreview
}: {
  watermark: Watermark;
  /** The image at this step (after crop), in full-size pixels. */
  imageSize: Size;
  scale: number;
  logo: LogoInfo | undefined;
  onChange: (w: Watermark) => void;
  onPreview: (w: Watermark) => void;
}) {
  if (w.tiled) return null;
  if (w.kind === "logo" && !logo) return null;
  if (w.kind === "text" && !lineOf(w.text)) return null;
  const item = itemSize(
    w,
    imageSize,
    w.kind === "logo" ? {logo} : {textWidth: textWidth(w, imageSize)}
  );
  const bounds = turnedBounds(item, w.rotation);
  const centre = placeCentre(w, imageSize, item);
  const box = {
    x: Math.round(centre.x - bounds.width / 2),
    y: Math.round(centre.y - bounds.height / 2),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height))
  };
  return (
    <BoxEditor
      box={box}
      imageSize={imageSize}
      scale={scale}
      dim={false}
      resizable={false}
      nudge={Math.max(1, Math.round(imageSize.width * 0.005))}
      ariaLabel="Watermark"
      onChange={(moved, final) =>
        (final ? onChange : onPreview)({
          ...w,
          anchor: "custom",
          x: (moved.x + moved.width / 2) / imageSize.width,
          y: (moved.y + moved.height / 2) / imageSize.height
        })
      }
    />
  );
}
