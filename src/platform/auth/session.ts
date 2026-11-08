/* Accounts for the tools on /services, through Supabase Auth.

   Everyone must sign in (with Google or an emailed link) before using a tool.
   The account only holds the person's email address and sign-in times: their
   files and text are still processed in the browser and never sent anywhere.

   The sign-in library is loaded the first time a /services page needs it,
   so the portfolio pages don't download it. One shared state is kept here,
   and every component that calls useAuth() sees the same value. */

import {useEffect, useState} from "react";
import type {AuthError, GoTrueClient, Session} from "@supabase/auth-js";

export type AuthState =
  | {status: "loading"}
  /** Sign-in isn't set up in this build, or the library failed to load. */
  | {status: "unavailable"}
  /** `notice` explains a sign-in attempt that didn't finish. */
  | {status: "signedOut"; notice?: string}
  | {status: "signedIn"; email: string};

const SUPABASE_URL = (process.env.REACT_APP_SUPABASE_URL ?? "").replace(
  /\/+$/,
  ""
);
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY ?? "";
const STORAGE_KEY = "office-tools-auth";

/* Query and hash parameters Supabase adds when it sends someone back here. */
const CALLBACK_PARAMS = ["code", "error", "error_code", "error_description"];

let state: AuthState = {status: "loading"};
const listeners = new Set<(next: AuthState) => void>();
let clientPromise: Promise<GoTrueClient> | null = null;

function setState(next: AuthState) {
  state = next;
  listeners.forEach(listener => listener(next));
}

function fromSession(session: Session | null, notice?: string): AuthState {
  if (session) return {status: "signedIn", email: session.user.email ?? ""};
  return notice ? {status: "signedOut", notice} : {status: "signedOut"};
}

function returnUrl(): string {
  return window.location.origin + window.location.pathname;
}

/* Reads what Supabase put in the address (before the library cleans it up),
   so a sign-in that didn't finish can be explained. */
function readCallback(): {hasCode: boolean; error: string | null} {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  return {
    hasCode: url.searchParams.has("code"),
    error:
      url.searchParams.get("error_description") ??
      hash.get("error_description") ??
      url.searchParams.get("error") ??
      hash.get("error")
  };
}

/* Takes the sign-in leftovers out of the address bar, so they aren't
   bookmarked or shared. */
function cleanCallbackFromUrl() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  let changed = false;
  for (const name of CALLBACK_PARAMS) {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name);
      changed = true;
    }
    if (hash.has(name)) {
      hash.delete(name);
      changed = true;
    }
  }
  if (!changed) return;
  const rest = hash.toString();
  url.hash = rest ? `#${rest}` : "";
  window.history.replaceState(window.history.state, "", url.toString());
}

function explain(message: string): string {
  return /expired|invalid/i.test(message)
    ? "That sign-in link has expired or was already used. Please ask for a new one."
    : `Sign-in didn't finish (${message}). Please try again.`;
}

async function startClient(): Promise<GoTrueClient> {
  const callback = readCallback();
  const {GoTrueClient} = await import("@supabase/auth-js");
  const client = new GoTrueClient({
    url: `${SUPABASE_URL}/auth/v1`,
    headers: {apikey: SUPABASE_KEY},
    storageKey: STORAGE_KEY,
    flowType: "pkce",
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true
  });
  const {error} = await client.initialize();
  const {
    data: {session}
  } = await client.getSession();
  cleanCallbackFromUrl();

  let notice: string | undefined;
  if (!session) {
    const problem = callback.error ?? error?.message;
    if (problem) notice = explain(problem);
    else if (callback.hasCode) {
      // The link was opened in another browser, which doesn't have the
      // one-time secret this browser kept when the link was requested.
      notice =
        "That sign-in link was opened in a different browser from the one you asked for it in. Please ask for a new link here, or open the link in the browser you used.";
    }
  }
  setState(fromSession(session, notice));
  client.onAuthStateChange((event, next) => {
    // The first event repeats the state set above; skipping it keeps `notice`.
    if (event !== "INITIAL_SESSION") setState(fromSession(next));
  });
  return client;
}

function client(): Promise<GoTrueClient> {
  if (!clientPromise) {
    clientPromise = startClient();
    clientPromise.catch(() => setState({status: "unavailable"}));
  }
  return clientPromise;
}

/** The current sign-in state; starts the sign-in library the first time. */
export function useAuth(): AuthState {
  const [current, setCurrent] = useState(state);
  useEffect(() => {
    listeners.add(setCurrent);
    if (!SUPABASE_URL || !SUPABASE_KEY) setState({status: "unavailable"});
    else void client();
    setCurrent(state);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current;
}

function failure(error: AuthError | null): string | null {
  if (!error) return null;
  if (error.status === 429 || /rate limit/i.test(error.message)) {
    return "Too many sign-in emails were asked for. Please wait a few minutes and try again.";
  }
  return `That didn't work (${error.message}). Please try again.`;
}

/** Leaves the site for Google's sign-in page, which sends the person back here. */
export async function signInWithGoogle(): Promise<string | null> {
  const {error} = await (
    await client()
  ).signInWithOAuth({
    provider: "google",
    options: {redirectTo: returnUrl()}
  });
  return failure(error);
}

/** Emails a one-time sign-in link that brings the person back to this page. */
export async function sendEmailLink(email: string): Promise<string | null> {
  const {error} = await (
    await client()
  ).signInWithOtp({
    email,
    options: {emailRedirectTo: returnUrl(), shouldCreateUser: true}
  });
  return failure(error);
}

/** Signs out on this device. */
export async function signOut(): Promise<void> {
  await (await client()).signOut({scope: "local"});
}

/** Deletes the account and everything stored with it, then signs out. */
export async function deleteAccount(): Promise<string | null> {
  const auth = await client();
  const {
    data: {session}
  } = await auth.getSession();
  if (!session) return null;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/delete_my_account`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: "{}"
      }
    );
    if (!response.ok) throw new Error(String(response.status));
  } catch {
    return "Your account couldn't be deleted just now. Please try again.";
  }
  await auth.signOut({scope: "local"});
  return null;
}
