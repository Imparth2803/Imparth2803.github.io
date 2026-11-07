/* Border and padding sizing logic.
   Layers from the inside out: image -> border (width border, solid) -> padding. */

export interface FramePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Frame {
  padding: FramePadding;
  paddingColour: string | "transparent";
  border: number;
  borderColour: string;
}

export const NO_FRAME: Frame = {
  padding: {top: 0, right: 0, bottom: 0, left: 0},
  paddingColour: "#ffffff",
  border: 0,
  borderColour: "#000000"
};

/** Calculates the output dimensions of an image with border and padding applied. */
export function framedSize(
  width: number,
  height: number,
  frame: Frame
): {width: number; height: number} {
  const b = Math.max(0, Math.round(frame.border));
  const p = frame.padding;
  const top = Math.max(0, Math.round(p.top));
  const right = Math.max(0, Math.round(p.right));
  const bottom = Math.max(0, Math.round(p.bottom));
  const left = Math.max(0, Math.round(p.left));

  return {
    width: Math.max(1, Math.round(width)) + 2 * b + left + right,
    height: Math.max(1, Math.round(height)) + 2 * b + top + bottom
  };
}

/** Whether the frame has any non-zero border or padding. */
export function isFramed(frame: Frame): boolean {
  return (
    frame.border > 0 ||
    frame.padding.top > 0 ||
    frame.padding.right > 0 ||
    frame.padding.bottom > 0 ||
    frame.padding.left > 0
  );
}
