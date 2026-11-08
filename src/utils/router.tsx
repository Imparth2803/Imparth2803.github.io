import React, {useEffect, useState} from "react";
import {findService, ServiceDefinition} from "../platform/registry";

/* Tiny client-side router (no dependency): the portfolio lives at "/", the
   blog at "/blog" and "/blog/<slug>", and the tools at "/services" and
   "/services/<slug>" (slugs come from the service registry). GitHub Pages
   serves 404.html for deep links, which bounces back to index.html with the
   original path restored (see public/404.html and public/spa-redirect.js). */

const NAV_EVENT = "app:navigate";

interface AppLocation {
  path: string;
  hash: string;
}

export type Route =
  | {name: "home"}
  | {name: "blogIndex"}
  | {name: "blogPost"; slug: string}
  | {name: "community"}
  | {name: "privacy"}
  | {name: "services"}
  | {name: "service"; service: ServiceDefinition}
  | {name: "notFound"};

function currentLocation(): AppLocation {
  return {path: window.location.pathname, hash: window.location.hash};
}

export function navigate(to: string): void {
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

export function useLocation(): AppLocation {
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
export function matchRoute(path: string): Route {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/") return {name: "home"};
  if (clean === "/blog") return {name: "blogIndex"};
  if (clean === "/community") return {name: "community"};
  if (clean === "/privacy") return {name: "privacy"};
  if (clean === "/services") return {name: "services"};
  const tool = clean.match(/^\/services\/([\w-]+)$/);
  const service = tool?.[1] ? findService(tool[1]) : undefined;
  if (service) return {name: "service", service};
  const post = clean.match(/^\/blog\/([\w-]+)$/);
  if (post?.[1]) return {name: "blogPost", slug: post[1]};
  return {name: "notFound"};
}

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {to: string};

/* <a> that navigates without a page reload (falls back to normal behaviour
   for modified clicks, e.g. open in new tab). */
export function Link({to, onClick, children, ...rest}: LinkProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
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
