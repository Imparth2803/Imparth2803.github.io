import {expect, Page, test} from "@playwright/test";

/* Signing in to use the tools. Supabase's replies are stubbed, so these run
   offline; the requests the page sends are checked instead. */

const TOOL = "/services/text-splitter";
const SESSION = {
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4102444800,
  user: {
    id: "00000000-0000-4000-8000-000000000002",
    aud: "authenticated",
    role: "authenticated",
    email: "new@example.com",
    app_metadata: {provider: "email"},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z"
  }
};

const signInPanel = (page: Page) =>
  page.getByRole("heading", {name: "Sign in to use the Text Splitter"});

test.describe("signed out", () => {
  test.use({storageState: {cookies: [], origins: []}});

  test("the catalog and tool descriptions are public, the tool is locked", async ({
    page
  }) => {
    await page.goto("/services");
    await expect(
      page.getByText("You'll need to sign in to use the tools.")
    ).toBeVisible();
    await expect(page.locator(".service-card").first()).toBeVisible();

    await page.goto(TOOL);
    await expect(signInPanel(page)).toBeVisible();
    await expect(
      page.getByRole("heading", {name: "About this tool"})
    ).toBeVisible();
    await expect(page.locator(".tool")).toHaveCount(0);
  });

  test("the sign-in panel links to the privacy policy", async ({page}) => {
    await page.goto(TOOL);
    await page.getByRole("link", {name: "Privacy policy"}).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", {name: "Privacy policy", level: 1})
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {name: "Deleting your account"})
    ).toBeVisible();
  });

  test("an emailed link signs in and opens the tool", async ({page}) => {
    let otpUrl = "";
    let otpBody: Record<string, unknown> = {};
    await page.route("**/auth/v1/otp**", route => {
      otpUrl = route.request().url();
      otpBody = route.request().postDataJSON();
      return route.fulfill({json: {}});
    });
    await page.goto(TOOL);
    await page.getByLabel("Email address").fill("new@example.com");
    await page.getByRole("button", {name: "Email me a sign-in link"}).click();
    await expect(
      page.getByText("We sent a sign-in link to new@example.com")
    ).toBeVisible();
    expect(otpBody.email).toBe("new@example.com");
    expect(otpBody.code_challenge, "uses the PKCE flow").toBeTruthy();
    expect(new URL(otpUrl).searchParams.get("redirect_to")).toBe(
      `http://localhost:5056${TOOL}`
    );

    // Opening the link: Supabase sends the person back with a one-time code,
    // through GitHub Pages' 404 bounce (the page is a deep link).
    let exchanged: Record<string, unknown> = {};
    await page.route("**/auth/v1/token?grant_type=pkce", route => {
      exchanged = route.request().postDataJSON();
      return route.fulfill({json: SESSION});
    });
    await page.goto(`${TOOL}?code=one-time-code`);
    await expect(page.locator(".tool")).toBeVisible();
    await expect(page.getByText("Signed in as new@example.com")).toBeVisible();
    expect(exchanged.auth_code).toBe("one-time-code");
    expect(page.url()).toBe(`http://localhost:5056${TOOL}`);
  });

  test("Continue with Google goes to Google through Supabase", async ({
    page
  }) => {
    await page.route("**/auth/v1/authorize**", route =>
      route.fulfill({contentType: "text/html", body: "<p>Google</p>"})
    );
    await page.goto(TOOL);
    await page.getByRole("button", {name: "Continue with Google"}).click();
    await page.waitForURL("**/auth/v1/authorize**");
    const url = new URL(page.url());
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe(
      `http://localhost:5056${TOOL}`
    );
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });

  test("a link opened in another browser explains what to do", async ({
    page
  }) => {
    await page.goto(`${TOOL}?code=from-another-browser`);
    await expect(page.getByRole("alert")).toContainText(
      "opened in a different browser"
    );
    await expect(signInPanel(page)).toBeVisible();
    expect(page.url()).toBe(`http://localhost:5056${TOOL}`);
  });

  test("an expired link explains what to do", async ({page}) => {
    await page.goto(
      `${TOOL}?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    );
    await expect(page.getByRole("alert")).toContainText(
      "That sign-in link has expired or was already used."
    );
    expect(page.url()).toBe(`http://localhost:5056${TOOL}`);
  });

  test("too many emails gets a plain message", async ({page}) => {
    await page.route("**/auth/v1/otp**", route =>
      route.fulfill({
        status: 429,
        json: {code: 429, error_code: "over_email_send_rate_limit", msg: "x"}
      })
    );
    await page.goto(TOOL);
    await page.getByLabel("Email address").fill("new@example.com");
    await page.getByRole("button", {name: "Email me a sign-in link"}).click();
    await expect(page.getByRole("alert")).toContainText(
      "Too many sign-in emails"
    );
  });
});

test.describe("signed in", () => {
  test("the tool opens without contacting Supabase", async ({page}) => {
    const calls: string[] = [];
    page.on("request", request => {
      if (!request.url().startsWith("http://localhost")) {
        calls.push(request.url());
      }
    });
    await page.goto(TOOL);
    await expect(page.locator(".tool")).toBeVisible();
    await expect(
      page.getByText("Signed in as tester@example.com")
    ).toBeVisible();
    expect(calls).toEqual([]);
  });

  test("signing out locks the tool again", async ({page}) => {
    await page.route("**/auth/v1/logout**", route =>
      route.fulfill({status: 204})
    );
    await page.goto(TOOL);
    await page.getByRole("button", {name: "Sign out"}).click();
    await expect(signInPanel(page)).toBeVisible();
    await page.reload();
    await expect(signInPanel(page)).toBeVisible();
  });

  test("deleting the account asks first, then signs out", async ({page}) => {
    let auth = "";
    await page.route("**/rest/v1/rpc/delete_my_account", route => {
      auth = route.request().headers()["authorization"] ?? "";
      return route.fulfill({status: 204});
    });
    await page.route("**/auth/v1/logout**", route =>
      route.fulfill({status: 403, json: {msg: "User not found"}})
    );
    await page.goto(TOOL);

    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", {name: "Delete account"}).click();
    await expect(page.locator(".tool")).toBeVisible();
    expect(auth).toBe("");

    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", {name: "Delete account"}).click();
    await expect(signInPanel(page)).toBeVisible();
    expect(auth).toBe("Bearer e2e-access-token");
  });

  test("a failed delete keeps the account and says so", async ({page}) => {
    await page.route("**/rest/v1/rpc/delete_my_account", route =>
      route.fulfill({status: 500})
    );
    await page.goto(TOOL);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", {name: "Delete account"}).click();
    await expect(page.getByRole("alert")).toContainText("couldn't be deleted");
    await expect(page.locator(".tool")).toBeVisible();
  });
});
