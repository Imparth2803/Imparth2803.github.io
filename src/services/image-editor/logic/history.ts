/* Undo and redo: every change is kept as a list of settings (never as
   images), so going back is instant and costs almost no memory. */

const MAX_STEPS = 100;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const start = <T>(present: T): History<T> => ({
  past: [],
  present,
  future: []
});

/** Records a change. Nothing is recorded when it changes nothing. */
export function commit<T>(
  h: History<T>,
  next: T,
  same: (a: T, b: T) => boolean
): History<T> {
  if (same(h.present, next)) return h;
  return {
    past: [...h.past, h.present].slice(-MAX_STEPS),
    present: next,
    future: []
  };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1]!,
    future: [h.present, ...h.future]
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0]!,
    future: h.future.slice(1)
  };
}
