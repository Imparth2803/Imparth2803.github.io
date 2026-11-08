import React from "react";
import "../containers/blogPage/BlogPage.scss";
import {Link} from "../utils/router";
import {contactInfo, greeting} from "../portfolio";
import {usePageMeta} from "./usePageMeta";

/* /privacy: what the site keeps about people, in plain words. Keep it in step
   with what the code actually stores (src/platform/auth, supabase/migrations). */
const UPDATED = "9 November 2026";

export default function PrivacyPage() {
  usePageMeta(
    `Privacy policy | ${greeting.username}`,
    "What this site keeps about you when you use its tools, and how to delete it."
  );
  const email = contactInfo.email_address;

  return (
    <main className="blog-page blog-page-narrow">
      <div className="blog-page-bar">
        <Link to="/services" className="blog-page-back">
          ← All tools
        </Link>
        <span>Updated {UPDATED}</span>
      </div>
      <header className="blog-page-header">
        <h1 className="blog-page-title">Privacy policy</h1>
        <p className="blog-page-lede">
          What this site keeps about you, why, and how to delete it.
        </p>
      </header>

      <div className="blog-prose">
        <h2>Your files stay on your device</h2>
        <p>
          The tools on <Link to="/services">/services</Link> work entirely in
          your browser. The files you open and the text you paste are never
          uploaded, stored or seen by anyone. The page's security settings block
          it from sending them anywhere.
        </p>

        <h2>Your account</h2>
        <p>You need an account to use the tools. When you sign in, we keep:</p>
        <ul>
          <li>your email address;</li>
          <li>when your account was created and when you last signed in;</li>
          <li>
            if you sign in with Google, the name and profile picture link that
            Google shares with us. Google doesn't share your password or
            anything else in your Google account.
          </li>
        </ul>
        <p>
          We use these only to let you sign in. They are not sold, shared or
          used for advertising.
        </p>

        <h2>Feedback you send</h2>
        <p>
          Under each tool there's a form to rate it and leave a comment. If you
          send it, we keep the rating, the comment, which tool it was about and
          when you sent it, linked to your account so we can tell feedback from
          different people apart. Nothing is sent unless you press{" "}
          <strong>Send feedback</strong>, and the form never includes your files
          or results. Please don't write personal details or your files'
          contents in the comment.
        </p>
        <p>
          Only the site's owner can read feedback. It's used to fix problems and
          decide what to improve.
        </p>

        <h2>Who stores it</h2>
        <p>
          Accounts and feedback are stored by{" "}
          <a href="https://supabase.com">Supabase</a>, on its servers in the
          Asia-Pacific region. For security, Supabase also records the IP
          address and browser used for each sign-in. The site itself is hosted
          by GitHub Pages, which may log visitors' IP addresses as described in{" "}
          <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
            GitHub's privacy statement
          </a>
          .
        </p>

        <h2>Stored in your browser</h2>
        <p>
          Your browser keeps your sign-in so you don't have to sign in on every
          visit, and remembers whether you chose the light or dark theme. These
          are kept in your browser's local storage, not in cookies, and are
          removed when you sign out or clear your browser's site data.
        </p>

        <h2>Deleting your account</h2>
        <p>
          Once signed in, use <strong>Delete account</strong> at the top of any
          tool page. It deletes your account and everything stored with it,
          including your feedback, straight away. You can also email{" "}
          <a href={`mailto:${email}`}>{email}</a> and we'll delete it for you.
        </p>

        <h2>Changes</h2>
        <p>
          If the site starts keeping anything new, this page will say so before
          it happens, and the date at the top will change.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about your data: <a href={`mailto:${email}`}>{email}</a>.
        </p>
      </div>
    </main>
  );
}
