import React, {useEffect, useRef} from "react";

/* A colour picker that shows the colour while it is being chosen and
   records it once the picker is closed. */
export function ColourInput({
  label,
  value,
  onPreview,
  onFinish
}: {
  label: string;
  value: string;
  onPreview: (colour: string) => void;
  onFinish: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    // React's onChange fires on every move; the native "change" event
    // fires once, when the colour is chosen.
    const done = () => finish.current();
    input.addEventListener("change", done);
    return () => input.removeEventListener("change", done);
  }, []);
  return (
    <input
      ref={ref}
      className="tool-color"
      type="color"
      aria-label={label}
      value={value}
      onChange={e => onPreview(e.target.value)}
      onBlur={onFinish}
    />
  );
}
