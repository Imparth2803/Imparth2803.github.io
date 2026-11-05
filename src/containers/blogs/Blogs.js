import React, {useContext} from "react";
import "./Blog.scss";
import BlogCard from "../../components/blogCard/BlogCard";
import {blogSection} from "../../portfolio";
import {usePosts} from "../../blog/posts";
import {Link} from "../../utils/router";
import {Fade} from "react-reveal";
import StyleContext from "../../contexts/StyleContext";

/* Homepage section: the latest few posts plus a link to /blog. */
export default function Blogs() {
  const {isDark} = useContext(StyleContext);
  const {posts} = usePosts();
  if (!blogSection.display) {
    return null;
  }
  const latest = (posts || []).slice(0, blogSection.postsOnHomepage);
  return (
    <Fade bottom duration={1000} distance="20px">
      <div className="main" id="blogs">
        <p
          className={
            isDark
              ? "dark-mode subTitle blog-subtitle"
              : "subTitle blog-subtitle"
          }
        >
          {blogSection.subtitle}
        </p>
        {posts && posts.length === 0 && (
          <p className="blog-empty">No posts yet. Check back soon.</p>
        )}
        <div className="blog-grid">
          {latest.map(post => (
            <BlogCard key={post.slug} post={post} isDark={isDark} />
          ))}
        </div>
        {posts && posts.length > 0 && (
          <Link to="/blog" className="blog-all-link">
            All posts ({posts.length}) →
          </Link>
        )}
      </div>
    </Fade>
  );
}
