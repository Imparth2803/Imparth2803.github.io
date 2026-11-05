/* Blog posts are Markdown files in src/blog/posts/. The file name is the URL
   slug: src/blog/posts/my-first-post.md -> /blog/my-first-post

   Each file starts with a frontmatter block:

     ---
     title: My first post
     date: 2026-11-05
     summary: One or two sentences shown on the post cards.
     tags: python, computer vision
     draft: false
     ---

   Posts with `draft: true` only show up in development (npm start). */

import {useEffect, useState} from "react";

function loadPostFiles() {
  // require.context is a webpack feature; it doesn't exist under Jest.
  if (process.env.NODE_ENV === "test") return [];
  const context = require.context("./posts", false, /\.md$/);
  return context.keys().map(key => ({
    slug: key.replace(/^\.\//, "").replace(/\.md$/, ""),
    url: context(key)
  }));
}

const postFiles = loadPostFiles();

export function parsePost(slug, raw) {
  const text = raw.replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (match) {
    match[1].split("\n").forEach(line => {
      const i = line.indexOf(":");
      if (i === -1) return;
      const key = line.slice(0, i).trim();
      const value = line
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key) meta[key] = value;
    });
  }
  const body = match ? text.slice(match[0].length) : text;
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: meta.title || slug,
    date: meta.date || "",
    summary: meta.summary || "",
    tags: meta.tags
      ? meta.tags
          .split(",")
          .map(tag => tag.trim())
          .filter(Boolean)
      : [],
    draft: meta.draft === "true",
    readingMinutes: Math.max(1, Math.round(words / 200)),
    body
  };
}

const cache = {};

function fetchPost({slug, url}) {
  if (!cache[slug]) {
    cache[slug] = fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`Could not load post "${slug}"`);
        return res.text();
      })
      .then(raw => parsePost(slug, raw))
      .catch(error => {
        delete cache[slug];
        throw error;
      });
  }
  return cache[slug];
}

const showDrafts = process.env.NODE_ENV === "development";

function isVisible(post) {
  return showDrafts || !post.draft;
}

/* All published posts, newest first. `posts` is null while loading. */
export function usePosts() {
  const [state, setState] = useState({posts: null, error: null});
  useEffect(() => {
    let active = true;
    Promise.all(postFiles.map(fetchPost))
      .then(posts => {
        if (!active) return;
        const visible = posts
          .filter(isVisible)
          .sort((a, b) => b.date.localeCompare(a.date));
        setState({posts: visible, error: null});
      })
      .catch(error => active && setState({posts: [], error}));
    return () => {
      active = false;
    };
  }, []);
  return state;
}

/* A single post. `post` is null while loading and undefined if not found. */
export function usePost(slug) {
  const [state, setState] = useState({post: null, error: null});
  useEffect(() => {
    let active = true;
    setState({post: null, error: null});
    const file = postFiles.find(f => f.slug === slug);
    if (!file) {
      setState({post: undefined, error: null});
      return undefined;
    }
    fetchPost(file)
      .then(
        post =>
          active &&
          setState({post: isVisible(post) ? post : undefined, error: null})
      )
      .catch(error => active && setState({post: undefined, error}));
    return () => {
      active = false;
    };
  }, [slug]);
  return state;
}

export function formatDate(date) {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}
