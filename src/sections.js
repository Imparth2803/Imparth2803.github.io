/* Numbered section bars + the scroll ruler's section index.
   Order here is the order on the page. Sections whose `show` is false
   are skipped and the remaining ones are renumbered automatically. */

import {
  skillsSection,
  educationInfo,
  workExperiences,
  bigProjects,
  openSource,
  achievementSection
} from "./portfolio";

const sections = [
  {
    key: "skills",
    label: "What I do",
    caption: "Python · AI · Computer vision · Automation",
    show: skillsSection.display
  },
  {
    key: "education",
    label: "Education",
    caption: "MSc Data Science · B.Tech CSE",
    show: educationInfo.display
  },
  {
    key: "experience",
    label: "Experience",
    caption: "Software · Data science · Since 2023",
    show: workExperiences.display
  },
  {
    key: "projects",
    label: "Projects",
    caption: "Selected work",
    show: bigProjects.display || openSource.display
  },
  {
    key: "achievements",
    label: "Achievements",
    caption: "Publications & awards",
    show: achievementSection.display
  },
  {
    key: "contact",
    label: "Contact",
    caption: "Say hello",
    show: true
  }
];

export const visibleSections = sections
  .filter(section => section.show)
  .map((section, i) => ({
    ...section,
    number: String(i + 1).padStart(2, "0"),
    domId: `section-${section.key}`
  }));

export function getSection(key) {
  return visibleSections.find(section => section.key === key);
}
