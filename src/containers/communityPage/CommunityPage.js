import React, {useEffect} from "react";
import "../blogPage/BlogPage.scss";
import Achievement from "../achievement/Achievement";
import SocialMedia from "../../components/socialMedia/SocialMedia";
import {Link} from "../../utils/router";
import {greeting, communitySection} from "../../portfolio";

/* /community: publications, awards and where to connect */
export default function CommunityPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = `${communitySection.title} | ${greeting.username}`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <>
      <main className="blog-page">
        <div className="blog-page-bar">
          <Link to="/" className="blog-page-back">
            ← Home
          </Link>
          <span>{communitySection.title}</span>
        </div>
        <header className="blog-page-header">
          <h1 className="blog-page-title">{communitySection.title}</h1>
          <p className="blog-page-lede">{communitySection.subtitle}</p>
        </header>
      </main>
      <Achievement />
      <div className="blog-page">
        <SocialMedia />
      </div>
    </>
  );
}
