import React, {useEffect} from "react";
import "../blogPage/BlogPage.scss";
import Skills from "../skills/Skills";
import StackProgress from "../skillProgress/skillProgress";
import StartupProject from "../StartupProjects/StartupProject";
import Achievement from "../achievement/Achievement";
import SocialMedia from "../../components/socialMedia/SocialMedia";
import {Link} from "../../utils/router";
import {greeting, servicesSection, communitySection} from "../../portfolio";

const SITE_TITLE = document.title;

function usePageTitle(title) {
  useEffect(() => {
    document.title = `${title} | ${greeting.username}`;
    return () => {
      document.title = SITE_TITLE;
    };
  }, [title]);
}

function PageIntro({title, subtitle}) {
  return (
    <main className="blog-page">
      <div className="blog-page-bar">
        <Link to="/" className="blog-page-back">
          ← Home
        </Link>
        <span>{title}</span>
      </div>
      <header className="blog-page-header">
        <h1 className="blog-page-title">{title}</h1>
        <p className="blog-page-lede">{subtitle}</p>
      </header>
    </main>
  );
}

/* /services: What I do, skills and projects */
export function ServicesPage() {
  usePageTitle(servicesSection.title);
  return (
    <>
      <PageIntro
        title={servicesSection.title}
        subtitle={servicesSection.subtitle}
      />
      <Skills />
      <StackProgress />
      <StartupProject />
    </>
  );
}

/* /community: publications, awards and where to connect */
export function CommunityPage() {
  usePageTitle(communitySection.title);
  return (
    <>
      <PageIntro
        title={communitySection.title}
        subtitle={communitySection.subtitle}
      />
      <Achievement />
      <div className="blog-page">
        <SocialMedia />
      </div>
    </>
  );
}
