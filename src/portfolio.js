/* Change this file to get your personal Portfolio */

// To change portfolio colors globally go to the  _globalColor.scss file

import emoji from "react-easy-emoji";
import splashAnimation from "./assets/lottie/splashAnimation"; // Rename to your file name for custom animation

// Splash Screen

const splashScreen = {
  enabled: true, // set false to disable splash screen
  animation: splashAnimation,
  duration: 2000 // Set animation duration as per your animation
};

// Summary And Greeting Section

const illustration = {
  animated: true // Set to false to use static SVG
};

const greeting = {
  username: "Parth Tawde",
  title: "Hi all, I'm Parth",
  titleHighlight: "Parth", // Word in the title shown in the accent color
  subTitle: emoji(
    "Python developer and MSc Data Science graduate building AI, computer vision and automation tools 🚀"
  ),
  resumeLink: "resume", // Set to empty to hide the "Download my resume" button (file: src/containers/greeting/resume.pdf)
  displayGreeting: true // Set false to hide this section, defaults to true
};

// Social Media Links

const socialMediaLinks = {
  github: "https://github.com/Imparth2803",
  linkedin: "https://www.linkedin.com/in/parth-tawde-549435211/",
  gmail: "parthtawde6r@gmail.com",
  // Instagram, Twitter, Medium, Kaggle etc. are also supported in the links!
  // To customize icons and social links, tweak src/components/SocialMedia
  display: true // Set true to display this section, defaults to false
};

// Skills Section

const skillsSection = {
  title: "What I do",
  subTitle:
    "PYTHON DEVELOPER BUILDING AI, COMPUTER VISION AND AUTOMATION SOLUTIONS",
  skills: [
    emoji(
      "⚡ Build full-stack web applications with Django, React, FastAPI, Node.js and Express"
    ),
    emoji(
      "⚡ Develop computer vision and image processing pipelines with OpenCV, Pillow and OCR"
    ),
    emoji(
      "⚡ Create AI-powered applications with LangChain, LangGraph, Ollama and local LLMs"
    ),
    emoji(
      "⚡ Train machine learning and deep learning models with TensorFlow, PyTorch, Keras and Scikit-learn"
    ),
    emoji(
      "⚡ Automate design and product personalisation workflows with Playwright and Adobe tools"
    )
  ],

  /* Make Sure to include correct Font Awesome Classname to view your icon
https://fontawesome.com/icons?d=gallery */

  softwareSkills: [
    {
      skillName: "python",
      fontAwesomeClassname: "fab fa-python"
    },
    {
      skillName: "sql",
      fontAwesomeClassname: "fas fa-database"
    },
    {
      skillName: "django / fastapi",
      fontAwesomeClassname: "fas fa-server"
    },
    {
      skillName: "reactjs",
      fontAwesomeClassname: "fab fa-react"
    },
    {
      skillName: "nodejs",
      fontAwesomeClassname: "fab fa-node"
    },
    {
      skillName: "typescript",
      fontAwesomeClassname: "fas fa-code"
    },
    {
      skillName: "computer vision",
      fontAwesomeClassname: "fas fa-eye"
    },
    {
      skillName: "machine learning",
      fontAwesomeClassname: "fas fa-brain"
    },
    {
      skillName: "generative ai",
      fontAwesomeClassname: "fas fa-robot"
    },
    {
      skillName: "data analysis",
      fontAwesomeClassname: "fas fa-chart-bar"
    },
    {
      skillName: "mongodb",
      fontAwesomeClassname: "fas fa-leaf"
    },
    {
      skillName: "git",
      fontAwesomeClassname: "fab fa-git-alt"
    }
  ],
  display: true // Set false to hide this section, defaults to true
};

// Education Section

const educationInfo = {
  display: true, // Set false to hide this section, defaults to true
  schools: [
    {
      schoolName: "University of Hertfordshire",
      subHeader: "Master of Science (M.Sc.) in Data Science",
      duration: "2024 - 2025",
      desc: "First Class Distinction. United Kingdom.",
      descBullets: [
        "Medical Imaging Data Science Club (Clustered Minds): designed retinal image enhancement using K-Means + Fuzzy C-Means with spatial features",
        "Earned Judges' Choice 4th place in a university-level data science competition"
      ]
    },
    {
      schoolName: "MIT ADT University",
      subHeader:
        "Bachelor of Technology (B.Tech) in Computer Science Engineering",
      duration: "2019 - 2023",
      desc: "Pune, India.",
      descBullets: [
        "Published: High-Resolution Satellite Imagery Analysis for Terrain and Surface Data Extraction: Techniques and Applications (2023)"
      ]
    }
  ]
};

// Your top 3 proficient stacks/tech experience

const techStack = {
  viewSkillBars: false, //Set it to true to show Proficiency Section
  experience: [
    {
      Stack: "Python / Backend", //Insert stack or technology you have experience in
      progressPercentage: "90%" //Insert relative proficiency in percentage
    },
    {
      Stack: "Machine Learning / Computer Vision",
      progressPercentage: "80%"
    },
    {
      Stack: "Frontend",
      progressPercentage: "65%"
    }
  ],
  displayCodersrank: false // Set true to display codersrank badges section need to changes your username in src/containers/skillProgress/skillProgress.js:17:62, defaults to false
};

// Work experience section

const workExperiences = {
  display: true, //Set it to true to show workExperiences Section
  experience: [
    {
      role: "Software Python Developer",
      company: "Nijikart",
      companylogo: require("./assets/images/Nijikart.jpeg"),
      date: "Jan 2026 – Present",
      desc: "Mumbai, India",
      descBullets: [
        "Build application features with Django and React, integrating backend processing with interactive workflows",
        "Develop Python software and product personalisation workflows for digital products",
        "Create personalised product assets using OpenCV, Pillow, Python libraries and Adobe tools",
        "Use Playwright to automate design operations on products, turning repetitive manual work into scalable browser-based workflows"
      ]
    },
    {
      role: "Analyst",
      company: "NeuIQ",
      companylogo: require("./assets/images/Neu.jpeg"),
      date: "Oct 2025 – Jan 2026",
      desc: "Mumbai, India",
      descBullets: [
        "Benchmarked model performance using statistical correlation metrics and evaluated proposed solutions",
        "Produced LLM-generated open-ended responses and reports/dashboards to assess real vs. synthetic data quality",
        "Generated CTGAN-based synthetic structured data aligned with real schemas while preserving distributions and relationships"
      ]
    },
    {
      role: "Data Science Intern",
      company: "Pinnotech Systems LLP",
      companylogo: require("./assets/images/pinnotech.jpeg"),
      date: "Jan 2023 – Aug 2023",
      desc: "Thane, India",
      descBullets: [
        "Built a VGG19 transfer-learning model for plant disease classification using preprocessing, augmentation and feature extraction",
        "Developed YOLO-based helmet, head and face detection using custom annotated datasets and mAP/IoU evaluation"
      ]
    }
  ]
};

/* Your Open Source Section to View Your Github Pinned Projects
To know how to get github key look at readme.md */

const openSource = {
  showGithubProfile: "true", // Set true or false to show Contact profile using Github, defaults to true
  display: true // Set false to hide this section, defaults to true
};

// Some big projects you have worked on

const bigProjects = {
  title: "Projects",
  subtitle: "SOME OF THE PROJECTS I HAVE BUILT",
  projects: [
    {
      projectName: "AI-Powered Document Management System",
      projectDesc:
        "Full-stack DMS with OCR for handwritten and scanned documents, plus local AI for summaries, entity extraction, tagging and classification.",
      tags: [
        "React",
        "TypeScript",
        "Node.js",
        "MongoDB",
        "FastAPI",
        "Ollama",
        "OCR"
      ]
    },
    {
      projectName: "Skin Lesion Classification",
      projectDesc:
        "Melanoma classification with a custom CNN and a fine-tuned Vision Transformer, tackling class imbalance with oversampling and weighted loss.",
      tags: ["TensorFlow", "PyTorch", "ViT", "Medical Imaging"],
      footerLink: [
        {
          name: "View Code",
          url: "https://github.com/Imparth2803/Data-Science-Project"
        }
      ]
    },
    {
      projectName: "High-Resolution Satellite Imagery Analysis",
      projectDesc:
        "U-Net models for land-cover and urban-feature extraction, with DEM/DTM/DSM terrain reconstruction and super-resolution.",
      tags: ["U-Net", "CNN", "Remote Sensing", "Published"],
      footerLink: [
        {
          name: "Read Publication",
          url: "https://ieeexplore.ieee.org/abstract/document/10392073/authors#authors"
        }
      ]
    },
    {
      projectName: "Netflix Recommendation System",
      projectDesc:
        "Collaborative filtering with Probabilistic Matrix Factorization, tuned with SGD, L2 regularisation and Bayesian priors to lower RMSE.",
      tags: ["Python", "Matrix Factorization", "RecSys"],
      footerLink: [
        {
          name: "View Code",
          url: "https://github.com/Imparth2803/ML_NN"
        }
      ]
    }
  ],
  display: true // Set false to hide this section, defaults to true
};

// Achievement Section
// Include certificates, talks etc

const achievementSection = {
  title: emoji("Achievements And Publications 🏆 "),
  subtitle: "Publications, awards and activities",

  achievementsCards: [
    {
      title: "Research Publication",
      subtitle:
        "High-Resolution Satellite Imagery Analysis for Terrain and Surface Data Extraction: Techniques and Applications (2023).",
      footerLink: [
        {
          name: "Read on IEEE Xplore",
          url: "https://ieeexplore.ieee.org/abstract/document/10392073/authors#authors"
        }
      ]
    },
    {
      title: "Judges' Choice – 4th Place",
      subtitle:
        "University-level data science competition (University of Hertfordshire, 2025) for retinal image enhancement using K-Means + Fuzzy C-Means.",
      footerLink: []
    }
  ],
  display: true // Set false to hide this section, defaults to true
};

// Blogs Section

// Posts are Markdown files in src/blog/posts/ (see src/blog/posts.js).
// The full list lives at /blog and each post at /blog/<file-name>.
const blogSection = {
  title: "Blog",
  subtitle: "Notes on Python, AI, computer vision and the things I build.",
  postsOnHomepage: 3, // How many of the latest posts the homepage shows
  display: true // Set false to hide the blog section and the Blog menu link
};

// Services and Community pages (header links only, not on the homepage)
const servicesSection = {
  title: "Services",
  subtitle: "What I do, the skills I bring and the projects I've built.",
  display: true // Set false to hide the /services page and its menu link
};

const communitySection = {
  title: "Community",
  subtitle: "Publications, awards and places to connect with me.",
  display: true // Set false to hide the /community page and its menu link
};

// Talks Sections

const talkSection = {
  title: "TALKS",
  subtitle: "",
  talks: [],
  display: false // Set false to hide this section, defaults to true
};

// Podcast Section

const podcastSection = {
  title: emoji("Podcast 🎙️"),
  subtitle: "",

  // Please Provide with Your Podcast embeded Link
  podcast: [],
  display: false // Set false to hide this section, defaults to true
};

// Resume Section
const resumeSection = {
  title: "Resume",
  subtitle: "Feel free to download my resume",

  // Please Provide with Your Podcast embeded Link
  display: true // Set false to hide this section, defaults to true
};

const contactInfo = {
  title: emoji("Contact Me ☎️"),
  subtitle:
    "Discuss a project or just want to say hi? My Inbox is open for all.",
  number: "", // Add a phone number here to show it publicly
  email_address: "parthtawde6r@gmail.com",
  buttonText: "Reach out to me" // Signature-style button text in the Contact section
};

// Twitter Section

const twitterDetails = {
  userName: "twitter", //Replace "twitter" with your twitter username without @
  display: false // Set true to display this section, defaults to false
};

const isHireable = false; // Set false if you are not looking for a job. Also isHireable will be display as Open for opportunities: Yes/No in the GitHub footer

export {
  servicesSection,
  communitySection,
  illustration,
  greeting,
  socialMediaLinks,
  splashScreen,
  skillsSection,
  educationInfo,
  techStack,
  workExperiences,
  openSource,
  bigProjects,
  achievementSection,
  blogSection,
  talkSection,
  podcastSection,
  contactInfo,
  twitterDetails,
  isHireable,
  resumeSection
};
