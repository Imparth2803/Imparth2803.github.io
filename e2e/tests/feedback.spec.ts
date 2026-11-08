import {expect, Page, Route, test} from "@playwright/test";

/* The "How was this tool?" form under each tool. Supabase's replies are
   stubbed; the requests the page sends are checked instead. */

const TOOL = "/services/list-cleaner";

function form(page: Page) {
  const section = page.locator("section.feedback");
  return {
    section,
    rating: (n: number) => section.getByRole("button", {name: `${n} out of 5`}),
    comment: section.getByRole("textbox"),
    send: section.getByRole("button", {name: "Send feedback"})
  };
}

/* Records what is sent to the feedback table and answers with `reply`. */
async function stubFeedback(
  page: Page,
  reply: (route: Route) => Promise<void> = route =>
    route.fulfill({status: 201, body: ""})
) {
  const sent: {body: unknown; headers: Record<string, string>}[] = [];
  await page.route("**/rest/v1/feedback", route => {
    sent.push({
      body: route.request().postDataJSON(),
      headers: route.request().headers()
    });
    return reply(route);
  });
  return sent;
}

test("sends a rating and a comment for this tool", async ({page}) => {
  const sent = await stubFeedback(page);
  await page.goto(TOOL);
  const f = form(page);
  await expect(
    f.section.getByRole("heading", {name: "How was the List Cleaner?"})
  ).toBeVisible();

  await f.rating(4).click();
  await expect(f.rating(4)).toHaveAttribute("aria-pressed", "true");
  await f.comment.fill("  Please add a way to keep blank lines.  ");
  await f.send.click();

  await expect(f.section.getByRole("status")).toContainText(
    "Your feedback was sent."
  );
  expect(sent).toHaveLength(1);
  expect(sent[0]!.body).toEqual({
    tool: "list-cleaner",
    rating: 4,
    comment: "Please add a way to keep blank lines."
  });
  expect(sent[0]!.headers["authorization"]).toBe("Bearer e2e-access-token");
  expect(sent[0]!.headers["prefer"]).toBe("return=minimal");

  // Sending more starts from an empty form.
  await f.section.getByRole("button", {name: "Send more feedback"}).click();
  await expect(f.rating(4)).toHaveAttribute("aria-pressed", "false");
  await expect(f.comment).toHaveValue("");
});

test("a rating alone is enough, and can be unselected", async ({page}) => {
  const sent = await stubFeedback(page);
  await page.goto(TOOL);
  const f = form(page);
  await f.rating(2).click();
  await f.rating(2).click();
  await expect(f.rating(2)).toHaveAttribute("aria-pressed", "false");
  await f.rating(5).click();
  await f.send.click();
  await expect(f.section.getByRole("status")).toBeVisible();
  expect(sent[0]!.body).toEqual({
    tool: "list-cleaner",
    rating: 5,
    comment: null
  });
});

test("an empty form asks for a rating or comment and sends nothing", async ({
  page
}) => {
  const sent = await stubFeedback(page);
  await page.goto(TOOL);
  const f = form(page);
  await f.comment.fill("   ");
  await f.send.click();
  await expect(f.section.getByRole("alert")).toContainText(
    "Choose a rating or write a comment first."
  );
  expect(sent).toHaveLength(0);
});

test("the daily limit gets a friendly message", async ({page}) => {
  await stubFeedback(page, route =>
    route.fulfill({
      status: 403,
      json: {
        code: "42501",
        message:
          'new row violates row-level security policy for table "feedback"'
      }
    })
  );
  await page.goto(TOOL);
  const f = form(page);
  await f.rating(3).click();
  await f.send.click();
  await expect(f.section.getByRole("alert")).toContainText(
    "You've sent a lot of feedback today."
  );
});

test("a failed send keeps what was written", async ({page}) => {
  await stubFeedback(page, route => route.fulfill({status: 500}));
  await page.goto(TOOL);
  const f = form(page);
  await f.rating(1).click();
  await f.comment.fill("It froze on a big file.");
  await f.send.click();
  await expect(f.section.getByRole("alert")).toContainText(
    "couldn't be sent just now"
  );
  await expect(f.comment).toHaveValue("It froze on a big file.");
  await expect(f.rating(1)).toHaveAttribute("aria-pressed", "true");
});

test("comments are limited to 2,000 characters", async ({page}) => {
  await page.goto(TOOL);
  const f = form(page);
  await f.comment.fill("a".repeat(1900));
  await expect(f.section.getByText("100 characters left")).toBeVisible();
  await f.comment.fill("a".repeat(2100));
  await expect(f.comment).toHaveValue("a".repeat(2000));
});

test.describe("signed out", () => {
  test.use({storageState: {cookies: [], origins: []}});

  test("there is no feedback form", async ({page}) => {
    await page.goto(TOOL);
    await expect(
      page.getByRole("heading", {name: "Sign in to use the List Cleaner"})
    ).toBeVisible();
    await expect(page.locator("section.feedback")).toHaveCount(0);
  });
});
