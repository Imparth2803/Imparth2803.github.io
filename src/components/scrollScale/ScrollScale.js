import React, {useEffect, useState} from "react";
import "./ScrollScale.scss";

const TICKS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

function getScrollPercent() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (window.scrollY / max) * 100));
}

// Shows how far down the page the reader is, on a 0 - 100 scale:
// a vertical ruler on desktop and a thin top bar + badge on mobile.
export default function ScrollScale() {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let frame = null;
    const update = () => {
      frame = null;
      setPercent(getScrollPercent());
    };
    const onScroll = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, {passive: true});
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const rounded = Math.round(percent);

  return (
    <div
      className="scroll-scale"
      role="progressbar"
      aria-label="Page scroll progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
    >
      <div className="scroll-scale-bar" style={{width: `${percent}%`}} />
      <div className="scroll-scale-badge">{rounded}%</div>

      <div className="scroll-scale-ruler" aria-hidden="true">
        <div className="scroll-scale-track">
          <div className="scroll-scale-fill" style={{height: `${percent}%`}} />
        </div>
        {TICKS.map(tick => (
          <div
            key={tick}
            className={
              tick % 50 === 0
                ? "scroll-scale-tick scroll-scale-tick-major"
                : "scroll-scale-tick"
            }
            style={{top: `${tick}%`}}
          >
            {tick % 50 === 0 && (
              <span className="scroll-scale-tick-label">{tick}</span>
            )}
          </div>
        ))}
        <div className="scroll-scale-marker" style={{top: `${percent}%`}}>
          {rounded}
        </div>
      </div>
    </div>
  );
}
