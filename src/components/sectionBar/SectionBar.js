import React from "react";
import "./SectionBar.scss";
import {getSection} from "../../sections";

/* Wraps a page section with a sticky "01 / TITLE ........ caption" bar.
   The bar sticks to the top of the viewport while its section is on screen. */
export default function SectionBlock({sectionKey, children}) {
  const section = getSection(sectionKey);
  if (!section) return children;

  return (
    <section className="section-block" id={section.domId}>
      <div className="section-bar">
        <h2 className="section-bar-index">
          {section.number}
          <span className="section-bar-slash">/</span>
          {section.label}
        </h2>
        <span className="section-bar-caption">{section.caption}</span>
      </div>
      {/* Empty slot where the section title from the left ruler lands */}
      <div className="section-title-space" aria-hidden="true" />
      {children}
    </section>
  );
}
