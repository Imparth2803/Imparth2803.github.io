import React, {useContext, useEffect, useMemo} from "react";
import {marked} from "marked";
import "../blogs/Blog.scss";
import "./BlogPage.scss";
import BlogCard from "../../components/blogCard/BlogCard";
import {blogSection, greeting} from "../../portfolio";
import {usePosts, usePost, formatDate} from "../../blog/posts";
import {Link} from "../../utils/router";
import StyleContext from "../../contexts/StyleContext";

const SITE_TITLE = document.title;

function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${greeting.username}` : SITE_TITLE;
    return () => {
      document.title = SITE_TITLE;
    };
  }, [title]);
}

function Status({children}) {
  return <p className="blog-page-status">{children}</p>;
}

/* /blog */
export function BlogIndex() {
  const {isDark} = useContext(StyleContext);
  const {posts, error} = usePosts();
  usePageTitle(blogSection.title);

  return (
    <main className="blog-page">
      <div className="blog-page-bar">
        <Link to="/" className="blog-page-back">
          ← Home
        </Link>
        <span>
          {posts ? `${posts.length} post${posts.length === 1 ? "" : "s"}` : ""}
        </span>
      </div>
      <header className="blog-page-header">
        <h1 className="blog-page-title">{blogSection.title}</h1>
        <p className="blog-page-lede">{blogSection.subtitle}</p>
      </header>
      {error && <Status>Couldn't load posts. Please try again later.</Status>}
      {!posts && <Status>Loading…</Status>}
      {posts && posts.length === 0 && !error && (
        <Status>No posts yet. Check back soon.</Status>
      )}
      {posts && posts.length > 0 && (
        <div className="blog-grid">
          {posts.map(post => (
            <BlogCard key={post.slug} post={post} isDark={isDark} />
          ))}
        </div>
      )}
    </main>
  );
}

/* /blog/<slug> */
export function BlogPost({slug}) {
  const {post, error} = usePost(slug);
  const html = useMemo(() => (post ? marked.parse(post.body) : ""), [post]);
  usePageTitle(post ? post.title : post === undefined ? "Post not found" : "");

  return (
    <main className="blog-page blog-page-narrow">
      <div className="blog-page-bar">
        <Link to="/blog" className="blog-page-back">
          ← All posts
        </Link>
        {post && (
          <span>
            {formatDate(post.date)} · {post.readingMinutes} min read
          </span>
        )}
      </div>
      {post === null && <Status>Loading…</Status>}
      {post === undefined && (
        <Status>
          {error
            ? "Couldn't load this post. Please try again later."
            : "This post doesn't exist."}{" "}
          <Link to="/blog">See all posts</Link>
        </Status>
      )}
      {post && (
        <article>
          <header className="blog-page-header">
            <h1 className="blog-page-title">{post.title}</h1>
            {post.tags.length > 0 && (
              <div className="post-card-tags">
                {post.tags.map(tag => (
                  <span key={tag} className="post-card-tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </header>
          <div
            className="blog-prose"
            // Posts are Markdown files from this repo, so their HTML is trusted.
            dangerouslySetInnerHTML={{__html: html}}
          />
          <div className="blog-page-footer">
            <Link to="/blog" className="blog-all-link">
              ← All posts
            </Link>
          </div>
        </article>
      )}
    </main>
  );
}

/* Any other unknown path */
export function NotFound() {
  usePageTitle("Page not found");
  return (
    <main className="blog-page blog-page-narrow">
      <header className="blog-page-header">
        <h1 className="blog-page-title">Page not found</h1>
      </header>
      <Status>
        <Link to="/">Back to the homepage</Link>
      </Status>
    </main>
  );
}
