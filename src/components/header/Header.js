import React, {useContext} from "react";
import Headroom from "react-headroom";
import "./Header.scss";
import ToggleSwitch from "../ToggleSwitch/ToggleSwitch";
import StyleContext from "../../contexts/StyleContext";
import {Link} from "../../utils/router";
import {
  greeting,
  workExperiences,
  skillsSection,
  bigProjects,
  blogSection,
  talkSection,
  achievementSection,
  resumeSection
} from "../../portfolio";

function Header() {
  const {isDark} = useContext(StyleContext);
  const viewExperience = workExperiences.display;
  const viewProjects = bigProjects.display;
  const viewSkills = skillsSection.display;
  const viewAchievement = achievementSection.display;
  const viewBlog = blogSection.display;
  const viewTalks = talkSection.display;
  const viewResume = resumeSection.display;

  return (
    <Headroom>
      <header className={isDark ? "dark-menu header" : "header"}>
        <Link to="/" className="logo">
          <span className="grey-color"> &lt;</span>
          <span className="logo-name">{greeting.username}</span>
          <span className="grey-color">/&gt;</span>
        </Link>
        <input className="menu-btn" type="checkbox" id="menu-btn" />
        <label
          className="menu-icon"
          htmlFor="menu-btn"
          style={{color: "white"}}
        >
          <span className={isDark ? "navicon navicon-dark" : "navicon"}></span>
        </label>
        <ul className={isDark ? "dark-menu menu" : "menu"}>
          {viewSkills && (
            <li>
              <Link to="/#skills">Skills</Link>
            </li>
          )}
          {viewExperience && (
            <li>
              <Link to="/#experience">Experience</Link>
            </li>
          )}
          {viewProjects && (
            <li>
              <Link to="/#projects">Projects</Link>
            </li>
          )}
          {viewAchievement && (
            <li>
              <Link to="/#achievements">Achievements</Link>
            </li>
          )}
          {viewBlog && (
            <li>
              <Link to="/blog">Blog</Link>
            </li>
          )}
          {viewTalks && (
            <li>
              <Link to="/#talks">Talks</Link>
            </li>
          )}
          {viewResume && (
            <li>
              <Link to="/#resume">Resume</Link>
            </li>
          )}
          <li>
            <Link to="/#contact">Contact Me</Link>
          </li>
          <li>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a>
              <ToggleSwitch />
            </a>
          </li>
        </ul>
      </header>
    </Headroom>
  );
}
export default Header;
