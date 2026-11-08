import React, {useState} from "react";
import "./Auth.scss";
import {AuthState, deleteAccount, signOut} from "./session";
import {flushUsage} from "../usage/recorder";

/* Who is signed in, with sign out and delete account. Shows nothing while
   the sign-in state is still being checked. */
export default function AccountBar({auth}: {auth: AuthState}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (auth.status === "signedOut") {
    return <p className="auth-bar">You'll need to sign in to use the tools.</p>;
  }
  if (auth.status !== "signedIn") return null;

  const remove = async () => {
    if (
      !window.confirm(
        "Delete your account? This removes your email address and everything stored with your account. It can't be undone."
      )
    ) {
      return;
    }
    setBusy(true);
    setProblem(null);
    const error = await deleteAccount();
    setBusy(false);
    if (error) setProblem(error);
  };

  return (
    <div className="auth-bar">
      <span>
        Signed in as <strong>{auth.email}</strong>
      </span>
      <button
        type="button"
        className="tool-button tool-button-quiet"
        onClick={() => {
          flushUsage(); // send waiting usage records while still signed in
          void signOut();
        }}
        disabled={busy}
      >
        Sign out
      </button>
      <button
        type="button"
        className="tool-button tool-button-quiet"
        onClick={remove}
        disabled={busy}
      >
        Delete account
      </button>
      {problem && (
        <p className="auth-bar-problem" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
