import React from "react";
import {useObjectUrl} from "./useObjectUrl";

/* One image in a batch result: a preview, details, warnings and buttons. */
export function ImageCard({
  preview,
  name,
  details,
  warnings,
  error,
  children
}: {
  preview: Blob | null;
  name: string;
  details?: React.ReactNode;
  warnings?: readonly string[];
  error?: string;
  children?: React.ReactNode;
}) {
  const url = useObjectUrl(preview);
  return (
    <li
      className={
        error ? "tool-image-card tool-image-card-failed" : "tool-image-card"
      }
    >
      <div className="tool-image-thumb">
        {url ? (
          <img src={url} alt="" loading="lazy" decoding="async" />
        ) : (
          <i className="fas fa-image" aria-hidden="true"></i>
        )}
      </div>
      <div className="tool-image-body">
        <p className="tool-image-name">{name}</p>
        {details && <div className="tool-muted">{details}</div>}
        {error && (
          <p className="tool-image-error" role="alert">
            {error}
          </p>
        )}
        {warnings && warnings.length > 0 && (
          <ul className="tool-image-warnings">
            {warnings.map(w => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {children && <div className="tool-actions-row">{children}</div>}
      </div>
    </li>
  );
}
