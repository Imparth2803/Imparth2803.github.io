# Supabase setup (accounts for the /services tools)

The tools on /services ask people to sign in, with Google or with a link sent
by email. Sign-in runs on [Supabase](https://supabase.com). The site stays on
GitHub Pages, and the browser talks to Supabase directly.

People's files and pasted text are still processed only in the browser, and
nothing in this setup ever receives them.

Do these steps once. Allow about 30 minutes, mostly for Google.

## 1. Create the project

1. Sign in at <https://supabase.com/dashboard> and click **New project** (the
   free plan is enough).
2. Choose a region close to your users (under **Need a specific region?**,
   for example Mumbai) and save the database password in a password manager.
   The site never uses this password.
3. Under **Security**:
   - **Enable Data API:** on. The site uses it for "Delete account" and later
     to save feedback and usage.
   - **Automatically expose new tables:** off. The scripts in `migrations/`
     grant access to each table explicitly.
   - **Enable automatic RLS:** on. Every new table starts locked until a rule
     allows access.

## 2. Copy the two public settings

Open **Project Settings → API Keys** (on older dashboards, **Settings → API**)
and copy:

- the **Project URL**, for example `https://abcdefgh.supabase.co`
- the **publishable key** (called the **anon public** key on older
  dashboards). Never copy the *secret* or *service_role* key.

Add both to `.env.production` (and to `.env.development` if you want sign-in
while running `npm start`):

```
REACT_APP_SUPABASE_URL=https://abcdefgh.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<publishable key>
```

These two values are meant to be public, because they end up in the page
anyway. Data is protected by the database's row-level security rules, not by
hiding the key.

## 3. Tell Supabase where people come back to

Open **Authentication → URL Configuration**:

- **Site URL:** `https://parthtawde.is-a.dev`
- **Redirect URLs:** add `https://parthtawde.is-a.dev/services/**`. For local
  testing, also add `http://localhost:3000/services/**`.

After signing in, people return to the tool page they started from.

## 4. Turn on Google sign-in

1. In <https://console.cloud.google.com>, create a project (or pick one).
2. Open **APIs & Services → OAuth consent screen** (on newer consoles,
   **Google Auth Platform → Branding**). Choose **External**, then fill in the
   app name, support email and your domain `parthtawde.is-a.dev`. Publish the
   app so anyone can sign in, not just test users.
3. Open **Credentials → Create credentials → OAuth client ID** (on newer
   consoles, **Clients → Create client**):
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://parthtawde.is-a.dev`
   - Authorized redirect URIs: `https://<your-project>.supabase.co/auth/v1/callback`
     (Supabase shows this exact address on its Google provider page).
4. Copy the client ID and client secret into Supabase under **Authentication →
   Sign In / Providers → Google**, then turn Google on.

## 5. Make email links reach everyone

Supabase's built-in email only delivers to members of your Supabase team and
sends very few messages an hour. To send sign-in links to the public, connect
your own email sender:

1. Create a free account with an email service such as
   [Resend](https://resend.com) and verify your sending domain there. That
   means adding the DNS records it gives you. For `parthtawde.is-a.dev`, these
   records go in through a pull request to is-a.dev, like the one that
   registered the domain. Check is-a.dev's docs for which record types it
   allows. If that's awkward, verify a domain you own instead.
2. In Supabase, open **Authentication → Emails → SMTP Settings**, turn on
   custom SMTP and enter the service's details. For Resend: host
   `smtp.resend.com`, port `465`, user `resend`, password = your Resend API
   key, sender = an address on your verified domain.
3. Open **Authentication → Rate Limits** and raise the email limit to what you
   expect, for example 30 an hour.
4. Optional: under **Authentication → Emails → Templates → Magic Link**, edit
   the wording people see.

Until this step is done, use Google, or test with your own address.

## 6. Run the database script

Open **SQL Editor → New query**, paste the contents of
[`migrations/001_accounts.sql`](migrations/001_accounts.sql) and click **Run**.
This adds "Delete account". Run later stages' scripts the same way, in number
order.

## 7. Deploy

Commit `.env.production` and push to `master`. GitHub Actions builds the site
with the two settings, and the page's security policy then allows the browser
to talk to your Supabase project, and only that project.

## Where to see things

- Accounts: **Authentication → Users**.
- (Stage 2) Feedback and (Stage 3) usage: **Table Editor**.
