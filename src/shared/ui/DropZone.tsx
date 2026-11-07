import React, {useRef, useState} from "react";

/* Drag files here, or use the button (works with keyboard and touch). The
   file input resets after each pick, so the same file can be picked again. */
export function DropZone({
  inputId,
  accept,
  multiple,
  hint,
  onFiles
}: {
  inputId: string;
  /** Extensions without the dot, e.g. ["jpg", "png"]. */
  accept: readonly string[];
  multiple: boolean;
  hint: string;
  onFiles: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={dragging ? "tool-drop tool-drop-active" : "tool-drop"}
      onDragOver={e => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
    >
      <i className="fas fa-file-upload" aria-hidden="true"></i>
      <p>{multiple ? "Drag files here, or" : "Drag a file here, or"}</p>
      <button
        type="button"
        className="tool-button"
        onClick={() => inputRef.current?.click()}
      >
        {multiple ? "Choose files" : "Choose a file"}
      </button>
      <p className="tool-field-hint">{hint}</p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        hidden
        multiple={multiple}
        accept={accept.map(ext => `.${ext}`).join(",")}
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
