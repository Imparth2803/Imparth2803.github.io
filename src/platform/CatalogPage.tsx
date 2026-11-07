import React, {useMemo, useState} from "react";
import "../containers/blogPage/BlogPage.scss";
import "./Services.scss";
import {Link} from "../utils/router";
import {greeting, servicesSection} from "../portfolio";
import {SERVICE_CATEGORIES, ServiceCategory, services} from "./registry";
import {filterServices} from "./catalogSearch";
import {usePageMeta} from "./usePageMeta";
import PrivacyNote from "./PrivacyNote";

/* /services: the catalog of every tool in the registry. */
export default function CatalogPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const shown = useMemo(
    () => filterServices(services, query, category),
    [query, category]
  );
  usePageMeta(
    `${servicesSection.title} | ${greeting.username}`,
    servicesSection.subtitle
  );

  return (
    <main className="blog-page">
      <div className="blog-page-bar">
        <Link to="/" className="blog-page-back">
          ← Home
        </Link>
        <span>
          {services.length} tool{services.length === 1 ? "" : "s"}
        </span>
      </div>
      <header className="blog-page-header">
        <h1 className="blog-page-title">{servicesSection.title}</h1>
        <p className="blog-page-lede">{servicesSection.subtitle}</p>
        <PrivacyNote />
      </header>

      <div className="services-filters">
        <label className="services-search">
          <span className="services-search-label">Search tools</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="For example: duplicates, PDF, resize"
          />
        </label>
        <div
          className="services-categories"
          role="group"
          aria-label="Show tools for"
        >
          {[null, ...SERVICE_CATEGORIES].map(option => (
            <button
              key={option ?? "all"}
              type="button"
              className="services-chip"
              aria-pressed={category === option}
              onClick={() => setCategory(option)}
            >
              {option ?? "All"}
            </button>
          ))}
        </div>
      </div>

      <p className="services-count" aria-live="polite">
        {shown.length === services.length
          ? `Showing all ${services.length} tools`
          : `${shown.length} of ${services.length} tools match`}
      </p>

      {shown.length === 0 ? (
        <p className="blog-page-status">
          No tools match. Try a shorter word or choose "All".
        </p>
      ) : (
        <ul className="services-grid">
          {shown.map(service => (
            <li key={service.slug}>
              <Link to={`/services/${service.slug}`} className="service-card">
                <span className="service-card-top">
                  <i className={service.icon} aria-hidden="true"></i>
                  <span className="service-card-category">
                    {service.category}
                  </span>
                  {service.status === "coming-soon" && (
                    <span className="service-card-status">Coming soon</span>
                  )}
                </span>
                <h2 className="service-card-name">{service.name}</h2>
                <p className="service-card-summary">{service.summary}</p>
                <span className="service-card-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
