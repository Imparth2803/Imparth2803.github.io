import React, {lazy, Suspense} from "react";
import "../containers/blogPage/BlogPage.scss";
import "./Services.scss";
import "../shared/ui/Tool.scss";
import {Link} from "../utils/router";
import {greeting} from "../portfolio";
import type {ServiceLimits} from "../shared/limits";
import type {ServiceDefinition, ToolLoader} from "./registry";
import ToolErrorBoundary from "./ToolErrorBoundary";
import {usePageMeta} from "./usePageMeta";
import PrivacyNote from "./PrivacyNote";
import {formatCount} from "../shared/text/numbers";
import {AuthState, useAuth} from "./auth/session";
import SignInPanel from "./auth/SignInPanel";
import AccountBar from "./auth/AccountBar";
import FeedbackForm from "./feedback/FeedbackForm";

/* Each tool's code is fetched the first time its page opens, then reused.
   (Every loader is typed with the limits its tool takes; the registry
   pairs them, so the cast here is safe.) */
type AnyTool = React.ComponentType<{limits: ServiceLimits}>;
const toolComponents = new Map<string, React.LazyExoticComponent<AnyTool>>();
function toolComponent(service: ServiceDefinition) {
  let component = toolComponents.get(service.slug);
  if (!component) {
    component = lazy(service.load as ToolLoader<ServiceLimits>);
    toolComponents.set(service.slug, component);
  }
  return component;
}

/* /services/<slug>: one tool's page. */
export default function ServicePage({service}: {service: ServiceDefinition}) {
  usePageMeta(
    `${service.seo.title} | ${greeting.username}`,
    service.seo.description
  );
  const auth = useAuth();

  return (
    <main
      className={
        service.wide
          ? "blog-page service-page-live service-page-wide"
          : "blog-page service-page-live"
      }
    >
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
        <AccountBar auth={auth} />
      </header>
      <LiveTool service={service} auth={auth} />
    </main>
  );
}

/* The tool and its feedback form only open once the person is signed in.
   The description below them is always shown. */
function LiveTool({
  service,
  auth
}: {
  service: ServiceDefinition;
  auth: AuthState;
}) {
  const {limits} = service;
  return (
    <>
      <ToolOrSignIn service={service} auth={auth} />
      {auth.status === "signedIn" && (
        <FeedbackForm toolSlug={service.slug} toolName={service.name} />
      )}
      <section className="service-page-section service-page-about">
        <h2>About this tool</h2>
        <p>{service.description}</p>
        <p>
          {aboutLimits(limits)} Everything happens on your device: nothing is
          uploaded, and nothing is kept after you close the page.
        </p>
      </section>
    </>
  );
}

function ToolOrSignIn({
  service,
  auth
}: {
  service: ServiceDefinition;
  auth: AuthState;
}) {
  switch (auth.status) {
    case "loading":
      return (
        <p className="blog-page-status">Checking whether you're signed in…</p>
      );
    case "unavailable":
      return (
        <div className="tool-notice tool-notice-error" role="alert">
          <p>
            Sign-in isn't working right now, so the tool can't open. Please try
            again later.
          </p>
        </div>
      );
    case "signedOut":
      return <SignInPanel toolName={service.name} notice={auth.notice} />;
    case "signedIn": {
      const Tool = toolComponent(service);
      return (
        <ToolErrorBoundary>
          <Suspense
            fallback={<p className="blog-page-status">Loading the tool…</p>}
          >
            <Tool limits={service.limits} />
          </Suspense>
        </ToolErrorBoundary>
      );
    }
  }
}

function aboutLimits(limits: ServiceLimits): string {
  switch (limits.kind) {
    case "text":
      return `It works with files up to ${limits.maxFileMB} MB (${
        limits.maxFileMBMobile
      } MB on phones and tablets) and up to ${formatCount(
        limits.maxRows
      )} rows at a time.`;
    case "images":
      return `It works with up to ${limits.maxFiles} images at a time (${limits.maxFilesMobile} on phones and tablets), each up to ${limits.maxFileMB} MB and ${limits.maxMegapixels} megapixels (${limits.maxMegapixelsMobile} on phones and tablets).`;
    case "editor":
      return `It works with images up to ${limits.maxFileMB} MB and ${limits.maxMegapixels} megapixels (${limits.maxFileMBMobile} MB and ${limits.maxMegapixelsMobile} megapixels on phones and tablets).`;
    case "pdf":
      return `It works with up to ${limits.maxFiles} PDFs at a time, ${
        limits.maxTotalMB
      } MB and ${formatCount(limits.maxPages)} pages in total (${
        limits.maxFilesMobile
      } PDFs, ${limits.maxTotalMBMobile} MB and ${formatCount(
        limits.maxPagesMobile
      )} pages on phones and tablets).`;
  }
}
