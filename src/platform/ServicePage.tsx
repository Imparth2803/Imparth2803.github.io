import React from "react";
import "../containers/blogPage/BlogPage.scss";
import "./Services.scss";
import {Link} from "../utils/router";
import {greeting} from "../portfolio";
import type {ServiceDefinition} from "./registry";
import {usePageMeta} from "./usePageMeta";
import PrivacyNote from "./PrivacyNote";

/* /services/<slug>: one tool's page. */
export default function ServicePage({service}: {service: ServiceDefinition}) {
  usePageMeta(
    `${service.seo.title} | ${greeting.username}`,
    service.seo.description
  );

  return (
    <main className="blog-page blog-page-narrow">
      <div className="blog-page-bar">
        <Link to="/services" className="blog-page-back">
          ← All tools
        </Link>
        <span>{service.category}</span>
      </div>
      <header className="blog-page-header">
        <h1 className="blog-page-title">
          <i
            className={`${service.icon} service-page-icon`}
            aria-hidden="true"
          ></i>
          {service.name}
        </h1>
        <p className="blog-page-lede">{service.summary}</p>
        <PrivacyNote />
      </header>

      <section className="service-page-section">
        <h2>What this tool does</h2>
        <p>{service.description}</p>
      </section>

      {service.status === "coming-soon" && (
        <section className="service-page-soon" role="status">
          <h2>Coming soon</h2>
          <p>
            This tool is being built. In the meantime, see the{" "}
            <Link to="/services">other tools</Link>.
          </p>
        </section>
      )}
    </main>
  );
}
