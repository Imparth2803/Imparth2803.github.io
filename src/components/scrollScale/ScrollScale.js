import React, {useCallback, useEffect, useRef, useState} from "react";
import "./ScrollScale.scss";
import {visibleSections} from "../../sections";

// Space kept clear at the top (header) and bottom of the ruler, in px
const INSET_TOP = 110;
const INSET_BOTTOM = 28;

const VALUES = Array.from({length: 101}, (_, i) => i);
const OVERVIEW_VALUES = VALUES.filter(v => v % 5 === 0);

function measure() {
  const docH = document.documentElement.scrollHeight;
  const vh = window.innerHeight;
  const scrollY = window.scrollY;
  const max = Math.max(1, docH - vh);
  const percent = Math.min(100, Math.max(0, (scrollY / max) * 100));
  const marks = visibleSections
    .map(section => {
      const el = document.getElementById(section.domId);
      if (!el) return null;
      const top = el.getBoundingClientRect().top + scrollY;
      return {...section, top};
    })
    .filter(Boolean);
  let active = null;
  marks.forEach(mark => {
    if (mark.top <= scrollY + vh * 0.35) active = mark.key;
  });
  return {docH, vh, scrollY, percent, marks, active};
}

function pad3(n) {
  return String(Math.round(n)).padStart(3, "0");
}

function tickClass(v) {
  if (v % 10 === 0) return "ruler-tick ruler-tick-major";
  if (v % 5 === 0) return "ruler-tick ruler-tick-mid";
  return "ruler-tick";
}

/* A page-length ruler on the right edge (0 = top of the page, 100 = bottom).
   - The ruler scrolls with the page; the blue reading line marks where you are.
   - Hover to see the whole 0 - 100 scale, the visible window and the sections.
   - Click or drag to jump; arrow keys / Page Up / Page Down / Home / End work too.
   On small screens it collapses to a thin top bar and a % badge. */
export default function ScrollScale() {
  const [m, setM] = useState({
    docH: 1,
    vh: 1,
    scrollY: 0,
    percent: 0,
    marks: [],
    active: null
  });
  const [hover, setHover] = useState(false);
  const [pointerY, setPointerY] = useState(null);
  const dragging = useRef(false);
  const frame = useRef(null);

  useEffect(() => {
    const update = () => {
      frame.current = null;
      setM(measure());
    };
    const schedule = () => {
      if (frame.current === null)
        frame.current = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, {passive: true});
    window.addEventListener("resize", schedule);
    // Page height changes as images/animations load
    const observer =
      "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
    if (observer) observer.observe(document.body);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (observer) observer.disconnect();
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  const scrollToClientY = useCallback(clientY => {
    const {docH, vh} = measure();
    const span = Math.max(1, vh - INSET_TOP - INSET_BOTTOM);
    const value = Math.min(1, Math.max(0, (clientY - INSET_TOP) / span));
    // Scroll so the reading line lands where the pointer is
    const target = value * (docH - vh);
    window.scrollTo({top: Math.max(0, target), behavior: "instant"});
  }, []);

  const onPointerDown = e => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setHover(true);
    scrollToClientY(e.clientY);
  };
  const onPointerMove = e => {
    setPointerY(e.clientY);
    if (dragging.current) scrollToClientY(e.clientY);
  };
  const endDrag = e => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = e => {
    const vh = window.innerHeight;
    const moves = {
      ArrowDown: vh * 0.1,
      ArrowUp: -vh * 0.1,
      PageDown: vh * 0.9,
      PageUp: -vh * 0.9
    };
    if (e.key in moves) {
      e.preventDefault();
      window.scrollBy({top: moves[e.key], behavior: "smooth"});
    } else if (e.key === "Home") {
      e.preventDefault();
      window.scrollTo({top: 0, behavior: "smooth"});
    } else if (e.key === "End") {
      e.preventDefault();
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth"
      });
    }
  };

  const jumpToSection = (e, mark) => {
    e.stopPropagation();
    window.scrollTo({top: mark.top, behavior: "smooth"});
  };

  const {docH, vh, scrollY, percent, marks, active} = m;
  const rounded = Math.round(percent);
  const span = Math.max(1, vh - INSET_TOP - INSET_BOTTOM);
  const lineY = INSET_TOP + (percent / 100) * span;
  const windowTop = INSET_TOP + (scrollY / docH) * span;
  const windowHeight = Math.max(12, (vh / docH) * span);
  const hoverValue =
    pointerY === null
      ? null
      : Math.min(100, Math.max(0, ((pointerY - INSET_TOP) / span) * 100));
  const hoverY = INSET_TOP + ((hoverValue || 0) / 100) * span;
  const activeSection = marks.find(mark => mark.key === active);

  return (
    <>
      {/* Mobile / narrow screens */}
      <div className="scroll-scale-bar" style={{width: `${percent}%`}} />
      <div className="scroll-scale-badge" aria-hidden="true">
        {rounded}%
      </div>

      {/* Desktop ruler */}
      <div
        className={hover ? "ruler ruler-open" : "ruler"}
        role="scrollbar"
        aria-controls="page-content"
        aria-label="Page position"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={
          activeSection ? `${rounded}% – ${activeSection.label}` : `${rounded}%`
        }
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => {
          if (!dragging.current) {
            setHover(false);
            setPointerY(null);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        <div className="ruler-glass" aria-hidden="true" />

        {/* Page-length ruler that moves with the content */}
        <div
          className="ruler-track"
          aria-hidden="true"
          style={{
            top: INSET_TOP,
            height: Math.max(1, docH - INSET_TOP - INSET_BOTTOM),
            transform: `translate3d(0, ${-scrollY}px, 0)`
          }}
        >
          {VALUES.map(v => (
            <div key={v} className={tickClass(v)} style={{top: `${v}%`}}>
              {v % 5 === 0 && <span className="ruler-label">{v}</span>}
            </div>
          ))}
        </div>

        {/* Whole-page overview, shown on hover */}
        <div
          className="ruler-overview"
          aria-hidden="true"
          style={{top: INSET_TOP, height: span}}
        >
          {OVERVIEW_VALUES.map(v => (
            <div key={v} className={tickClass(v)} style={{top: `${v}%`}}>
              <span className="ruler-label">{v}</span>
            </div>
          ))}
        </div>
        <div
          className="ruler-window"
          aria-hidden="true"
          style={{top: windowTop, height: windowHeight}}
        />
        {hoverValue !== null && (
          <div className="ruler-hover-line" style={{top: hoverY}}>
            <span>{pad3(hoverValue)}</span>
          </div>
        )}

        {/* Section index, shown on hover */}
        <ol className="ruler-sections">
          {marks.map(mark => (
            <li
              key={mark.key}
              className={
                mark.key === active
                  ? "ruler-section ruler-section-active"
                  : "ruler-section"
              }
              style={{top: INSET_TOP + (mark.top / docH) * span}}
            >
              <button
                type="button"
                tabIndex={hover ? 0 : -1}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => jumpToSection(e, mark)}
              >
                <span className="ruler-section-number">{mark.number}</span>
                {mark.label}
              </button>
            </li>
          ))}
        </ol>

        {/* Reading line: where you are now */}
        <div className="ruler-reading" style={{top: lineY}} aria-hidden="true">
          <span className="ruler-reading-value">{pad3(percent)}%</span>
          {activeSection && (
            <span className="ruler-reading-section">{activeSection.label}</span>
          )}
        </div>
      </div>
    </>
  );
}
