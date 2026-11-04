import React, {useEffect, useRef} from "react";
import "./SectionRail.scss";
import {visibleSections} from "../../sections";

/* Left-hand page ruler + section titles that travel along it.

   Every section title is split into letters, and each letter is placed from
   the scroll position on every frame:
   - Upcoming sections wait as a small stack in the bottom-left corner.
   - As a section comes up the page, its title peels off the stack, bends
     around a curve and rides up the left ruler, level with the section.
   - When the section nears the top of the window, the letters fly to the
     top-left and grow into the large "current" title, while the previous
     title drifts up and fades away.
   Hidden below 1100px wide, like the right-hand ruler. */

// ---- Layout (px) ----
const RULER_INSET_TOP = 110; // match the right-hand ruler
const RULER_INSET_BOTTOM = 28;
const RAIL_X = 30; // centre line of the vertical title on the ruler
const ROW_X = 72; // left edge of the stacked titles
const RADIUS = ROW_X - RAIL_X; // bend from the stack onto the ruler
const ARC = (Math.PI / 2) * RADIUS;
const TITLE_SPACE = 72; // empty slot under each section bar (SectionBar.scss)
const FADE_RISE = 28; // a passed title drifts up this far as it fades out
const ROW_GAP = 17; // distance between rows in the upcoming stack
const BOTTOM = 30; // last upcoming row, from the bottom of the window
const LEAD = 22; // first letter rides this far below the section top

// ---- Letter sizes, relative to the 34px base font ----
const SMALL = 0.44;
const ON_RULER = 0.56;
const BIG = 1;

// A title rides the ruler until its section top reaches MORPH_START, then
// flies to the top-left, arriving as the section top reaches MORPH_END
// (both fractions of the window height).
const MORPH_START = 0.38;
const MORPH_END = 0.12;
const STAGGER = 0.6; // later letters start later

const TICKS = Array.from({length: 101}, (_, i) => i);

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);

function tickClass(v) {
  if (v % 10 === 0) return "rail-tick rail-tick-major";
  if (v % 5 === 0) return "rail-tick rail-tick-mid";
  return "rail-tick";
}

// Where a letter sits at distance u along a section's path.
// u <= 0: on its stacked row; 0..ARC: on the bend; > ARC: up the ruler.
function onPath(u, rowY) {
  if (u <= 0) return {x: ROW_X - u, y: rowY, rot: 0, scale: SMALL};
  if (u <= ARC) {
    const t = u / RADIUS;
    return {
      x: ROW_X - RADIUS * Math.sin(t),
      y: rowY - RADIUS + RADIUS * Math.cos(t),
      rot: (t * 180) / Math.PI,
      scale: lerp(SMALL, ON_RULER, u / ARC)
    };
  }
  return {x: RAIL_X, y: rowY - RADIUS - (u - ARC), rot: 90, scale: ON_RULER};
}

// Letter centres for a straight, left-aligned title at the given scale
function rowCentres(widths, scale) {
  let x = ROW_X;
  return widths.map(w => {
    const c = x + (w * scale) / 2;
    x += w * scale;
    return c;
  });
}

function letterProgress(p, i, n) {
  const delay = n > 1 ? (STAGGER * i) / (n - 1) : 0;
  return ease(clamp01(p * (1 + STAGGER) - delay));
}

export default function SectionRail() {
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const readingRef = useRef(null);
  const letterRefs = useRef(visibleSections.map(() => []));
  const groupRefs = useRef([]);
  const widths = useRef(null);
  const frame = useRef(null);

  useEffect(() => {
    let cancelled = false;

    // Measure every letter at the base size (transforms off)
    const measure = () => {
      widths.current = letterRefs.current.map(letters =>
        letters.map(el => {
          if (!el) return 0;
          const prev = el.style.transform;
          el.style.transform = "none";
          const w = el.getBoundingClientRect().width;
          el.style.transform = prev;
          return w;
        })
      );
    };

    const render = () => {
      frame.current = null;
      const root = rootRef.current;
      if (!root || !widths.current) return;
      if (getComputedStyle(root).display === "none") return; // narrow screens

      const vh = window.innerHeight;
      const scrollY = window.scrollY;
      const docH = document.documentElement.scrollHeight;
      const maxScroll = Math.max(1, docH - vh);
      const remaining = maxScroll - scrollY;
      const end = vh * MORPH_END;
      const band = vh * (MORPH_START - MORPH_END);
      // The current title lands in the empty slot under its section bar
      const bar = document.querySelector(".section-bar");
      const slotOffset = (bar ? bar.offsetHeight : 44) + TITLE_SPACE / 2;
      const realTops = [];
      const n = visibleSections.length;

      // Ruler track + reading line
      const span = Math.max(1, vh - RULER_INSET_TOP - RULER_INSET_BOTTOM);
      const percent = clamp01(scrollY / maxScroll);
      if (trackRef.current) {
        trackRef.current.style.height = `${Math.max(
          1,
          docH - RULER_INSET_TOP - RULER_INSET_BOTTOM
        )}px`;
        trackRef.current.style.transform = `translate3d(0, ${-scrollY}px, 0)`;
      }
      if (readingRef.current) {
        readingRef.current.style.top = `${RULER_INSET_TOP + percent * span}px`;
      }

      // Section tops in the window. Sections too low to ever reach the
      // top of the window are pulled up as the page nears its end, so the last
      // title still arrives at the top.
      const tops = visibleSections.map(section => {
        const el = document.getElementById(section.domId);
        if (!el) {
          realTops.push(end);
          return Infinity;
        }
        const top = el.getBoundingClientRect().top;
        realTops.push(top);
        const shortfall = top + scrollY - maxScroll - end;
        if (shortfall > 0) {
          const k = clamp01(1 - remaining / (band + shortfall));
          return top - shortfall * k;
        }
        return top;
      });
      const morph = tops.map(t => clamp01((end + band - t) / band));

      visibleSections.forEach((section, s) => {
        const letters = letterRefs.current[s];
        const w = widths.current[s];
        const count = letters.length;
        const p = morph[s];
        const q = s + 1 < n ? morph[s + 1] : 0;

        const rowY = vh - BOTTOM - (n - 1 - s) * ROW_GAP;
        const bigX = rowCentres(w, BIG);
        // Land in the slot under this section's bar; once the section has
        // scrolled past the landing line the title stays fixed there.
        // (Sections at the very bottom never reach the line, so their title
        // lands in their own slot, lower down.)
        const slotY = end + slotOffset + Math.max(0, realTops[s] - end);

        // How far the first letter has travelled along the path
        let u =
          tops[s] === Infinity
            ? 0
            : Math.max(0, ARC + (rowY - RADIUS) - (tops[s] + LEAD));
        u -= (w[0] || 0) * SMALL * 0.5;

        const group = groupRefs.current[s];
        if (group) {
          const state =
            p >= 0.5 && q < 0.5 ? "current" : p >= 0.5 ? "passed" : "upcoming";
          if (group.dataset.state !== state) group.dataset.state = state;
        }

        for (let i = 0; i < count; i++) {
          const el = letters[i];
          if (!el) continue;
          // Walk along the path letter by letter
          if (i > 0) {
            const sc = onPath(u, rowY).scale;
            u -= ((w[i - 1] + w[i]) * sc) / 2;
          }
          const a = onPath(u, rowY);
          const pi = letterProgress(p, i, count);
          const qi = letterProgress(q, i, count);

          // ruler path -> current title -> faded out once scrolled past
          const x = lerp(a.x, bigX[i], pi);
          const y = lerp(a.y, slotY, pi) - FADE_RISE * qi;
          const rot = lerp(a.rot, 0, pi);
          const scale = lerp(a.scale, BIG, pi) * (1 - 0.15 * qi);
          const opacity = 1 - qi;
          el.style.opacity = opacity.toFixed(3);
          el.style.visibility = opacity < 0.02 ? "hidden" : "visible";
          el.style.transform =
            `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
            `translate(-50%, -50%) rotate(${rot.toFixed(
              2
            )}deg) scale(${scale.toFixed(4)})`;
        }
      });
    };

    const schedule = () => {
      if (frame.current === null)
        frame.current = window.requestAnimationFrame(render);
    };
    const remeasure = () => {
      measure();
      schedule();
    };

    measure();
    render();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) remeasure();
      });
    }
    window.addEventListener("scroll", schedule, {passive: true});
    window.addEventListener("resize", remeasure);
    const observer =
      "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
    if (observer) observer.observe(document.body);
    return () => {
      cancelled = true;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", remeasure);
      if (observer) observer.disconnect();
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  const jumpTo = domId => {
    const el = document.getElementById(domId);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({top, behavior: "smooth"});
  };

  return (
    <div className="section-rail" ref={rootRef} aria-hidden="true">
      <div className="rail-glass" />
      <div className="rail-track" ref={trackRef} style={{top: RULER_INSET_TOP}}>
        {TICKS.map(v => (
          <div key={v} className={tickClass(v)} style={{top: `${v}%`}}>
            {v % 10 === 0 && <span className="rail-label">{v}</span>}
          </div>
        ))}
      </div>
      <div className="rail-reading" ref={readingRef} />

      <div className="rail-titles">
        {visibleSections.map((section, s) => (
          <div
            key={section.key}
            className="rail-title"
            data-state="upcoming"
            ref={el => (groupRefs.current[s] = el)}
          >
            {Array.from(section.label.toUpperCase()).map((ch, i) => (
              <span
                key={i}
                className="rail-letter"
                ref={el => (letterRefs.current[s][i] = el)}
                onClick={() => jumpTo(section.domId)}
              >
                {ch}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
