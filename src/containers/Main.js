import React, {useEffect, useState} from "react";
import Header from "../components/header/Header";
import Greeting from "./greeting/Greeting";
import Skills from "./skills/Skills";
import StackProgress from "./skillProgress/skillProgress";
import WorkExperience from "./workExperience/WorkExperience";
import Projects from "./projects/Projects";
import StartupProject from "./StartupProjects/StartupProject";
import Achievement from "./achievement/Achievement";
import Blogs from "./blogs/Blogs";
import Footer from "../components/footer/Footer";
import Talks from "./talks/Talks";
import Podcast from "./podcast/Podcast";
import Education from "./education/Education";
import ScrollToTopButton from "./topbutton/Top";
import ScrollScale from "../components/scrollScale/ScrollScale";
import SectionRail from "../components/sectionRail/SectionRail";
import SectionBlock from "../components/sectionBar/SectionBar";
import Twitter from "./twitter-embed/twitter";
import Profile from "./profile/Profile";
import SplashScreen from "./splashScreen/SplashScreen";
import {BlogIndex, BlogPost, NotFound} from "./blogPage/BlogPage";
import CommunityPage from "./communityPage/CommunityPage";
import CatalogPage from "../platform/CatalogPage";
import ServicePage from "../platform/ServicePage";
import PrivacyPage from "../platform/PrivacyPage";
import {useLocation, matchRoute} from "../utils/router";
import {splashScreen} from "../portfolio";
import {StyleProvider} from "../contexts/StyleContext";
import {useLocalStorage} from "../hooks/useLocalStorage";
import "./Main.scss";
import "../theme.scss";

const Main = () => {
  const darkPref = window.matchMedia("(prefers-color-scheme: dark)");
  const [isDark, setIsDark] = useLocalStorage("isDark", darkPref.matches);
  const {path, hash} = useLocation();
  const route = matchRoute(path);
  // The splash animation only plays when the site is opened on the homepage
  const [isShowingSplashAnimation, setIsShowingSplashAnimation] = useState(
    () => matchRoute(window.location.pathname).name === "home"
  );

  // After switching pages, jump to the requested section or the top
  useEffect(() => {
    const target = hash && document.getElementById(hash.slice(1));
    if (target) {
      target.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [path, hash, isShowingSplashAnimation]);

  useEffect(() => {
    if (splashScreen.enabled && isShowingSplashAnimation) {
      const splashTimer = setTimeout(
        () => setIsShowingSplashAnimation(false),
        splashScreen.duration
      );
      return () => {
        clearTimeout(splashTimer);
      };
    }
  }, [isShowingSplashAnimation]);

  const changeTheme = () => {
    setIsDark(!isDark);
  };

  return (
    <div
      id="page-content"
      className={isDark ? "dark-mode app-root" : "app-root"}
    >
      <StyleProvider value={{isDark: isDark, changeTheme: changeTheme}}>
        {isShowingSplashAnimation && splashScreen.enabled ? (
          <SplashScreen />
        ) : route.name !== "home" ? (
          <>
            <Header />
            {route.name === "blogIndex" && <BlogIndex />}
            {route.name === "blogPost" && <BlogPost slug={route.slug} />}
            {route.name === "services" && <CatalogPage />}
            {route.name === "service" && (
              <ServicePage service={route.service} />
            )}
            {route.name === "community" && <CommunityPage />}
            {route.name === "privacy" && <PrivacyPage />}
            {route.name === "notFound" && <NotFound />}
            <Footer />
            <ScrollToTopButton />
          </>
        ) : (
          <>
            <Header />
            <Greeting />
            <SectionBlock sectionKey="skills">
              <Skills />
              <StackProgress />
            </SectionBlock>
            <SectionBlock sectionKey="education">
              <Education />
            </SectionBlock>
            <SectionBlock sectionKey="experience">
              <WorkExperience />
            </SectionBlock>
            <SectionBlock sectionKey="projects">
              <StartupProject />
              <Projects />
            </SectionBlock>
            <SectionBlock sectionKey="achievements">
              <Achievement />
            </SectionBlock>
            <SectionBlock sectionKey="blog">
              <Blogs />
            </SectionBlock>
            <Talks />
            <Twitter />
            <Podcast />
            <SectionBlock sectionKey="contact">
              <Profile />
            </SectionBlock>
            <Footer />
            <ScrollToTopButton />
            <ScrollScale />
            <SectionRail />
          </>
        )}
      </StyleProvider>
    </div>
  );
};

export default Main;
