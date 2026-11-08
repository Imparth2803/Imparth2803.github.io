import React, {useState} from "react";
import "./Auth.scss";
import {Link} from "../../utils/router";
import {sendEmailLink, signInWithGoogle} from "./session";

/* Shown in place of a tool until the person signs in. */
export default function SignInPanel({
  toolName,
  notice
}: {
  toolName: string;
  notice?: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const google = async () => {
    setBusy(true);
    setProblem(null);
    // On success the browser leaves for Google, so `busy` stays on.
    const error = await signInWithGoogle();
    if (error) {
      setProblem(error);
      setBusy(false);
    }
  };

  const emailLink = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    setBusy(true);
    setProblem(null);
    const error = await sendEmailLink(address);
    setBusy(false);
    if (error) setProblem(error);
    else setSentTo(address);
  };

  return (
    <section className="auth-panel" aria-labelledby="auth-panel-title">
      <h2 id="auth-panel-title">Sign in to use the {toolName}</h2>
      <p className="auth-lede">
        The tools are free. Sign in with Google, or we can email you a link.
      </p>

      {(problem ?? notice) && (
        <div className="tool-notice tool-notice-error" role="alert">
          <p>{problem ?? notice}</p>
        </div>
      )}

      {sentTo ? (
        <div className="tool-notice tool-notice-success" role="status">
          <p>
            We sent a sign-in link to <strong>{sentTo}</strong>. Open it in this
            browser to continue. It can take a minute to arrive, so check your
            spam folder too.
          </p>
          <button
            type="button"
            className="tool-button tool-button-quiet"
            onClick={() => setSentTo(null)}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="tool-button tool-button-primary"
            onClick={google}
            disabled={busy}
          >
            <i className="fab fa-google" aria-hidden="true"></i>
            Continue with Google
          </button>
          <p className="auth-or">or</p>
          <form className="auth-email" onSubmit={emailLink}>
            <label className="tool-field">
              <span className="tool-field-label">Email address</span>
              <input
                type="email"
                className="tool-input"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <button type="submit" className="tool-button" disabled={busy}>
              Email me a sign-in link
            </button>
          </form>
        </>
      )}

      <p className="auth-fineprint">
        Your account keeps your email address and when you signed in (and, if
        you use Google, the name and picture Google shares). Your files are
        still processed in your browser and are never uploaded.{" "}
        <Link to="/privacy">Privacy policy</Link>
      </p>
    </section>
  );
}
