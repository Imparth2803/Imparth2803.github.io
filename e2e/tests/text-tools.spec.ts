import {expect, test} from "@playwright/test";
import {
  fixture,
  openFile,
  openTool,
  paste,
  saveDownload,
  sheetsOf,
  watchNetwork
} from "./helpers";

test.describe("Text Splitter", () => {
  test("splits the requirements example and downloads it", async ({page}) => {
    await openTool(page, "text-splitter");
    const network = watchNetwork(page);
    await paste(
      page,
      "splitter-input",
      "Parth,25,Mumbai\nRahul,28,Pune\nAmit,30,Thane"
    );
    await page.getByRole("button", {name: "Type them"}).click();
    await page.getByPlaceholder("Name, Age, City").fill("Name, Age, City");
    await page.getByRole("button", {name: "Split text"}).click();

    const table = page.locator(".tool-preview table");
    await expect(table.locator("th")).toHaveText(["Name", "Age", "City"]);
    await expect(table.locator("tbody tr")).toHaveCount(3);

    const xlsx = await saveDownload(page, () =>
      page.getByRole("button", {name: "Excel (.xlsx)"}).click()
    );
    expect(xlsx.name).toBe("split-text.xlsx");
    expect(sheetsOf(xlsx.bytes)["Split text"]).toEqual([
      ["Name", "Age", "City"],
      ["Parth", "25", "Mumbai"],
      ["Rahul", "28", "Pune"],
      ["Amit", "30", "Thane"]
    ]);
    network.expectNothingSent();
  });

  test("keeps quoted values and leading zeros from a CSV file", async ({
    page
  }) => {
    await openTool(page, "text-splitter");
    await openFile(page, "splitter-input", fixture("quoted-values.csv"));
    await page.getByRole("button", {name: "Use the first row"}).click();
    await page.getByRole("button", {name: "Split text"}).click();
    await expect(
      page.locator(".tool-preview tbody tr").first().locator("td")
    ).toHaveText(["Parth", "Flat 2, Andheri, Mumbai", "09876543210"]);
    const csv = await saveDownload(page, () =>
      page.getByRole("button", {name: "CSV"}).click()
    );
    const text = csv.bytes.toString("utf8");
    expect(text.charCodeAt(0)).toBe(0xfeff); // byte-order mark for Excel
    expect(text).toContain('"Flat 2, Andheri, Mumbai",09876543210');
    expect(text).toContain('"Sharma, Rahul",Pune,');
  });

  test("copies the result as columns for pasting into a spreadsheet", async ({
    page,
    context,
    browserName
  }) => {
    test.skip(
      browserName !== "chromium",
      "Clipboard permissions can only be granted in Chromium"
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openTool(page, "text-splitter");
    await paste(page, "splitter-input", "a;b\nc;d");
    await page.getByLabel("Split wherever there is a").selectOption(";");
    await page.getByRole("button", {name: "Split text"}).click();
    await page.getByRole("button", {name: "Copy"}).click();
    await expect(page.getByRole("button", {name: "Copied"})).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "Column 1\tColumn 2\r\na\tb\r\nc\td"
    );
  });
});

test.describe("Column Combiner", () => {
  test("combines first and last names (requirements example)", async ({
    page
  }) => {
    await openTool(page, "column-combiner");
    const network = watchNetwork(page);
    await paste(
      page,
      "combiner-input",
      "First Name\tLast Name\nParth\tTawde\nRahul\tSharma"
    );
    await expect(
      page.getByLabel("The first row has column names")
    ).toBeChecked();
    await page.getByRole("button", {name: "Combine columns"}).click();
    await expect(page.locator(".tool-preview-text")).toHaveText(
      "Parth Tawde, Rahul Sharma"
    );
    network.expectNothingSent();
  });

  test("builds an SQL list from one column of an Excel sheet", async ({
    page
  }) => {
    await openTool(page, "column-combiner");
    await openFile(page, "combiner-input", fixture("staff.xlsx"));
    await expect(page.getByLabel("Sheet")).toBeVisible();
    for (const name of ["First Name", "Last Name", "PIN"])
      await page.getByLabel(name).uncheck();
    await page.getByRole("button", {name: "SQL IN list"}).click();
    await page.getByRole("button", {name: "Combine columns"}).click();
    await expect(page.locator(".tool-preview-text")).toHaveText(
      "('007', '012', '123')"
    );
    const txt = await saveDownload(page, () =>
      page.getByRole("button", {name: "Text (.txt)"}).click()
    );
    expect(txt.name).toBe("staff-combined.txt");
    expect(txt.bytes.toString("utf8")).toBe("('007', '012', '123')");
  });
});

test.describe("List Cleaner", () => {
  test("cleans the requirements example", async ({page}) => {
    await openTool(page, "list-cleaner");
    const network = watchNetwork(page);
    await paste(page, "cleaner-input", "Parth\nRahul\n\nParth\nAMIT\n Rahul");
    await page.getByLabel("Sort").selectOption("az");
    await page.getByRole("button", {name: "Clean list"}).click();
    await expect(page.locator(".tool-summary")).toContainText("Before6");
    await expect(page.locator(".tool-summary")).toContainText("After3");
    await expect(page.locator(".tool-preview td")).toHaveText([
      "AMIT",
      "Parth",
      "Rahul"
    ]);
    await page.getByRole("tab", {name: /Removed/}).click();
    await expect(page.locator(".tool-preview tbody tr")).toHaveCount(3);
    network.expectNothingSent();
  });

  test("reads an old Windows-1252 file and says so", async ({page}) => {
    await openTool(page, "list-cleaner");
    await openFile(page, "cleaner-input", fixture("legacy-windows-1252.txt"));
    await expect(page.getByText(/read as Western European/)).toBeVisible();
    await page.getByRole("button", {name: "Clean list"}).click();
    await expect(page.locator(".tool-preview td")).toHaveText([
      "Café",
      "Zoë",
      "José"
    ]);
    const xlsx = await saveDownload(page, () =>
      page.getByRole("button", {name: "Excel (.xlsx)"}).click()
    );
    expect(sheetsOf(xlsx.bytes)["Cleaned list"]).toEqual([
      ["List"],
      ["Café"],
      ["Zoë"],
      ["José"]
    ]);
  });

  test("cleans one column of a CSV with a byte-order mark", async ({page}) => {
    await openTool(page, "list-cleaner");
    await openFile(page, "cleaner-input", fixture("with-bom.csv"));
    await page.getByLabel("Column with the list").selectOption({label: "City"});
    await page.getByRole("button", {name: "Clean list"}).click();
    await expect(page.locator(".tool-preview td")).toHaveText([
      "Zürich",
      "São Paulo"
    ]);
  });
});

test.describe("Two-List Comparator", () => {
  test("compares the requirements example and exports everything", async ({
    page
  }) => {
    await openTool(page, "two-list-comparator");
    const network = watchNetwork(page);
    await paste(page, "list-a", "Parth\nRahul\nAmit\nSneha");
    await paste(page, "list-b", "Parth\nRahul\nPriya");
    await page.getByRole("button", {name: "Compare lists"}).click();
    await expect(page.locator(".tool-preview td")).toHaveText([
      "Parth",
      "Rahul"
    ]);
    await page.getByRole("tab", {name: /Only in List A/}).click();
    await expect(page.locator(".tool-preview td")).toHaveText([
      "Amit",
      "Sneha"
    ]);
    await page.getByRole("tab", {name: /Only in List B/}).click();
    await expect(page.locator(".tool-preview td")).toHaveText(["Priya"]);

    const all = await saveDownload(page, () =>
      page.getByRole("button", {name: "Everything (Excel)"}).click()
    );
    const sheets = sheetsOf(all.bytes);
    expect(Object.keys(sheets)).toEqual([
      "Summary",
      "In both lists",
      "Only in List A",
      "Only in List B",
      "Repeated in List A",
      "Repeated in List B"
    ]);
    expect(sheets["Only in List A"]).toEqual([["Value"], ["Amit"], ["Sneha"]]);
    network.expectNothingSent();
  });

  test("compares a spreadsheet column with pasted IDs, keeping leading zeros", async ({
    page
  }) => {
    await openTool(page, "two-list-comparator");
    await openFile(page, "list-a", fixture("ids-leading-zeros.csv"));
    await paste(page, "list-b", "007\n7\n999");
    await page.getByRole("button", {name: "Compare lists"}).click();
    await expect(page.locator(".tool-preview td")).toHaveText(["007"]);
    await page.getByRole("tab", {name: /Only in List B/}).click();
    await expect(page.locator(".tool-preview td")).toHaveText(["7", "999"]);
  });
});

test.describe("problems are explained in plain words", () => {
  test("damaged spreadsheet", async ({page}) => {
    await openTool(page, "list-cleaner");
    await openFile(page, "cleaner-input", fixture("corrupted.xlsx"));
    await expect(page.getByRole("alert")).toContainText("couldn't be opened");
  });

  test("binary file named .csv", async ({page}) => {
    await openTool(page, "column-combiner");
    await openFile(page, "combiner-input", fixture("corrupted.csv"));
    await expect(page.getByRole("alert")).toContainText(
      "doesn't look like a text file"
    );
  });

  test("empty file and wrong file type", async ({page}) => {
    await openTool(page, "text-splitter");
    await openFile(page, "splitter-input", fixture("empty.txt"));
    await expect(page.getByRole("alert")).toContainText("is empty");
    await page
      .locator("#splitter-input-file")
      .setInputFiles(fixture("staff.xlsx"));
    await expect(page.getByRole("alert")).toContainText(
      "isn't a file type this tool reads"
    );
  });

  test("a tool that fails to load doesn't break the rest of the site", async ({
    page
  }) => {
    // Open the catalog first so sign-in (its own chunk) has loaded, then
    // make the tool's code fail to download.
    await page.goto("/services");
    await expect(page.getByText("Signed in as")).toBeVisible();
    await page.route(/\/static\/js\/.*\.chunk\.js$/, route => route.abort());
    await page.getByRole("link", {name: /List Cleaner/}).click();
    await expect(page.getByRole("alert")).toContainText("ran into a problem");
    await page.unroute(/\/static\/js\/.*\.chunk\.js$/);
    await page.getByRole("link", {name: "← All tools"}).click();
    await expect(page.locator(".service-card")).toHaveCount(11);
  });
});
