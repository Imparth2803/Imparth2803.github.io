import React from "react";
import "./BlogCard.scss";
import {Link} from "../../utils/router";
import {formatDate} from "../../blog/posts";

export default function BlogCard({post, isDark}) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className={isDark ? "post-card dark-mode" : "post-card"}
    >
      <span className="post-card-meta">
        {formatDate(post.date)}
        <span className="post-card-dot">·</span>
        {post.readingMinutes} min read
        {post.draft && <span className="post-card-draft">Draft</span>}
      </span>
      <h3 className="post-card-title">{post.title}</h3>
      {post.summary && <p className="post-card-summary">{post.summary}</p>}
      {post.tags.length > 0 && (
        <span className="post-card-tags">
          {post.tags.map(tag => (
            <span key={tag} className="post-card-tag">
              {tag}
            </span>
          ))}
        </span>
      )}
      <span className="post-card-arrow" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
