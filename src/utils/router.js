import React, {useEffect, useState} from "react";

/* Tiny client-side router (no dependency): the portfolio lives at "/" and the
   blog at "/blog" and "/blog/<slug>". GitHub Pages serves 404.html for deep
   links, which bounces back to index.html with the original path restored
   (see public/404.html and the script in public/index.html). */

const NAV_EVENT = "app:navigate";

function currentLocation() {
  return {path: window.location.pathname, hash: window.location.hash};
}

export function navigate(to) {
  const target = new URL(to, window.location.origin);
  if (
    target.pathname === window.location.pathname &&
    target.hash === window.location.hash
  ) {
    // Already here: just bring the section back into view
    const el = target.hash && document.getElementById(target.hash.slice(1));
    if (el) el.scrollIntoView();
    return;
  }
  window.history.pushState({}, "", target.pathname + target.hash);
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function useLocation() {
  const [location, setLocation] = useState(currentLocation);
  useEffect(() => {
    const update = () => setLocation(currentLocation());
    window.addEventListener("popstate", update);
    window.addEventListener(NAV_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(NAV_EVENT, update);
    };
  }, []);
  return location;
}

/* Matches the current path against the app's routes. */
export function matchRoute(path) {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/blog") return {name: "blogIndex"};
  if (clean === "/services") return {name: "services"};
  if (clean === "/community") return {name: "community"};
  const post = clean.match(/^\/blog\/([\w-]+)$/);
  if (post) return {name: "blogPost", slug: post[1]};
  if (clean === "/") return {name: "home"};
  return {name: "notFound"};
}

/* <a> that navigates without a page reload (falls back to normal behaviour
   for modified clicks, e.g. open in new tab). */
export function Link({to, onClick, children, ...rest}) {
  const handleClick = event => {
    if (onClick) onClick(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
