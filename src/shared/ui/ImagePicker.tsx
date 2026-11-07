import React, {useState} from "react";
import {
  IMAGE_TYPES,
  ImageHeader,
  ImageType,
  readFileHeader
} from "../images/header";
import {fileLimitMB, formatBytes, ImageLimits, isSmallDevice} from "../limits";
import {DropZone} from "./DropZone";
import {Notice} from "./ToolStep";

export interface PickedImage {
  id: number;
  file: File;
  header: ImageHeader;
}

let nextId = 1;

/* Adds images to a batch. Each file is checked straight away by its real
   contents (not just its name): type, file size and megapixels. Problem
   files are listed with the reason; the rest are added. */
export function ImagePicker({
  id,
  types,
  limits,
  images,
  onChange
}: {
  id: string;
  types: readonly ImageType[];
  limits: ImageLimits;
  images: PickedImage[];
  onChange: (images: PickedImage[]) => void;
}) {
  const [problems, setProblems] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const small = isSmallDevice();
  const maxFiles = small ? limits.maxFilesMobile : limits.maxFiles;
  const maxMB = fileLimitMB(limits);
  const maxMP = small ? limits.maxMegapixelsMobile : limits.maxMegapixels;
  const extensions = types.flatMap(type =>
    type === "jpeg" ? ["jpg", "jpeg"] : [IMAGE_TYPES[type].ext]
  );
  const typeNames = types.map(type => IMAGE_TYPES[type].label).join(", ");

  const add = async (files: File[]) => {
    setChecking(true);
    const found: string[] = [];
    const added: PickedImage[] = [];
    for (const file of files) {
      if (images.length + added.length >= maxFiles) {
        found.push(
          `Only ${maxFiles} images can be done at once on this device, so the rest weren't added. Do them in another batch.`
        );
        break;
      }
      if (file.size > maxMB * 1024 * 1024) {
        found.push(
          `“${file.name}” is ${formatBytes(
            file.size
          )}; the limit is ${maxMB} MB.`
        );
        continue;
      }
      const header = await readFileHeader(file).catch(() => null);
      if (!header || !types.includes(header.type)) {
        found.push(
          `“${file.name}” isn't a ${typeNames} image (or it's damaged).`
        );
        continue;
      }
      const megapixels = (header.width * header.height) / 1e6;
      if (megapixels > maxMP) {
        found.push(
          `“${file.name}” is ${header.width} × ${
            header.height
          } (${megapixels.toFixed(
            0
          )} megapixels); this device can handle up to ${maxMP}.`
        );
        continue;
      }
      added.push({id: nextId++, file, header});
    }
    setProblems(found);
    setChecking(false);
    if (added.length) onChange([...images, ...added]);
  };

  return (
    <div className="tool-source" id={id}>
      <DropZone
        inputId={`${id}-files`}
        accept={extensions}
        multiple
        hint={`${typeNames} · up to ${maxFiles} images, ${maxMB} MB each`}
        onFiles={files => void add(files)}
      />
      {checking && (
        <p className="tool-muted" role="status">
          Checking the files…
        </p>
      )}
      {problems.length > 0 && (
        <Notice tone="error">
          <p>
            {problems.length === 1
              ? "One file wasn't added:"
              : "Some files weren't added:"}
          </p>
          <ul className="tool-list">
            {problems.map(problem => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Notice>
      )}
      {images.length > 0 && (
        <div className="tool-actions-row">
          <span className="tool-muted">
            {images.length} {images.length === 1 ? "image" : "images"} added (
            {formatBytes(
              images.reduce((sum, image) => sum + image.file.size, 0)
            )}
            )
          </span>
          <button
            type="button"
            className="tool-button tool-button-quiet"
            onClick={() => {
              setProblems([]);
              onChange([]);
            }}
          >
            Remove all
          </button>
        </div>
      )}
    </div>
  );
}
