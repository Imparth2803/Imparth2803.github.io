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

test.describe("Text Formatter", () => {
  test("formats the requirements example", async ({page}) => {
    await openTool(page, "text-formatter");
    const network = watchNetwork(page);
    await paste(
      page,
      "formatter-input",
      "   PARTH    TAWDE\n   rahul sharma\n   AMIT PATIL"
    );
    await page.getByLabel("Letter case").selectOption("title");
    await page.getByRole("button", {name: "Format text"}).click();
    await expect(page.locator(".tool-preview-text")).toHaveText(
      "Parth Tawde\nRahul Sharma\nAmit Patil"
    );
    await expect(page.locator(".tool-summary")).toContainText("After: words6");
    const txt = await saveDownload(page, () =>
      page.getByRole("button", {name: "Text (.txt)"}).click()
    );
    expect(txt.bytes.toString("utf8")).toBe(
      "Parth Tawde\nRahul Sharma\nAmit Patil"
    );
    network.expectNothingSent();
  });

  test("finds and replaces, numbers lines and wraps", async ({page}) => {
    await openTool(page, "text-formatter");
    await paste(
      page,
      "formatter-input",
      "Mr. Sharma visited Mr. Patil yesterday"
    );
    await page.getByLabel("Find").fill("mr.");
    await page.getByLabel("Replace with").fill("Dr.");
    await page.getByLabel("Break lines longer than").fill("20");
    await page.getByLabel("Number each line (1. 2. 3.)").check();
    await page.getByRole("button", {name: "Format text"}).click();
    await expect(page.locator(".tool-preview-text")).toHaveText(
      "1. Dr. Sharma visited\n2. Dr. Patil yesterday"
    );
  });
});

test.describe("Smart Date & Time Formatter", () => {
  test("asks before reading ambiguous dates, then converts", async ({page}) => {
    await openTool(page, "date-time-formatter");
    const network = watchNetwork(page);
    await openFile(page, "dates-input", fixture("dates-ambiguous.csv"));
    await page.getByLabel("The first row has column names").check();
    await expect(page.getByText("4 rows")).toBeVisible();
    await page.getByRole("button", {name: "Convert dates"}).click();
    await expect(
      page.locator(".tool-notice", {hasText: "could be read two ways"})
    ).toBeVisible();
    await expect(page.locator(".tool-preview")).toHaveCount(0); // nothing converted yet
    await page.getByRole("button", {name: "Day first (25/12/2026)"}).click();
    await expect(
      page.locator(".tool-preview tbody tr").nth(0).locator("td")
    ).toHaveText(["05/06/2026", "2026-06-05", ""]);
    await expect(page.locator(".tool-summary")).toContainText(
      "Couldn't convert1"
    );
    await page.getByLabel("Show only the 1 row to check").check();
    await expect(
      page.locator(".tool-preview tbody tr.tool-row-problem td").first()
    ).toHaveText("not a date");
    network.expectNothingSent();
  });

  test("reads the requirements examples and exports the whole table", async ({
    page
  }) => {
    await openTool(page, "date-time-formatter");
    await paste(page, "dates-input", "07/11/2026\n7 Nov 2026\n2026.11.07");
    await page
      .getByLabel("How are dates like 05/06/2026 written?")
      .selectOption("dmy");
    await page.getByRole("button", {name: "Convert dates"}).click();
    await expect(
      page.locator(".tool-preview tbody td:nth-child(2)")
    ).toHaveText(["2026-11-07", "2026-11-07", "2026-11-07"]);
    const xlsx = await saveDownload(page, () =>
      page.getByRole("button", {name: "Excel (.xlsx)"}).click()
    );
    expect(sheetsOf(xlsx.bytes)["Converted dates"]).toEqual([
      ["Column 1", "Column 1 (converted)", "Note"],
      ["07/11/2026", "2026-11-07", ""],
      ["7 Nov 2026", "2026-11-07", ""],
      ["2026.11.07", "2026-11-07", ""]
    ]);
  });

  test("reads real Excel dates exactly and counts working days", async ({
    page
  }) => {
    await openTool(page, "date-time-formatter");
    await page
      .getByRole("button", {name: "Count days between two dates"})
      .click();
    await openFile(page, "dates-input", fixture("dates.xlsx"));
    await expect(page.getByLabel("End date column")).toHaveValue("1");
    await page.getByLabel("Holidays (optional)").fill("2026-11-09");
    await page.getByRole("button", {name: "Count days", exact: true}).click();
    // 7 Nov 2026 (Sat) to 11 Nov (Wed): 4 days; working days Mon–Wed minus the Monday holiday = 2.
    await expect(
      page.locator(".tool-preview tbody tr").first().locator("td")
    ).toHaveText(["2026-11-07", "2026-11-11", "4", "2", ""]);
    await expect(
      page.locator(".tool-notice", {hasText: "could be read two ways"})
    ).toHaveCount(0);
  });
});

test.describe("CSV Converter", () => {
  test("turns an old semicolon CSV into Excel, keeping every digit", async ({
    page
  }) => {
    await openTool(page, "csv-converter");
    const network = watchNetwork(page);
    await openFile(page, "csv-input", fixture("semicolon-windows-1252.csv"));
    await expect(page.getByText("Found: semicolon")).toBeVisible();
    await expect(page.getByText(/read as Western European/)).toBeVisible();
    await expect(page.locator(".tool-preview td").first()).toHaveText("Renée");
    await page.getByRole("button", {name: "Convert", exact: true}).click();
    await expect(page.getByText(/more than 15 digits/)).toContainText(
      "every digit is kept"
    );
    const xlsx = await saveDownload(page, () =>
      page.getByRole("button", {name: "Download Excel (.xlsx)"}).click()
    );
    expect(xlsx.name).toBe("semicolon-windows-1252.xlsx");
    expect(sheetsOf(xlsx.bytes)["semicolon-windows-1252"]).toEqual([
      ["Name", "City", "Account"],
      ["Renée", "Zürich", "9876543210123456789"],
      ["José", "Málaga", "0042"]
    ]);
    network.expectNothingSent();
  });

  test("lets the person pick the encoding", async ({page}) => {
    await openTool(page, "csv-converter");
    await openFile(page, "csv-input", fixture("semicolon-windows-1252.csv"));
    await page.getByLabel("Text encoding").selectOption("utf-8");
    await expect(page.locator(".tool-preview td").first()).toHaveText("Ren�e");
    await page.getByLabel("Text encoding").selectOption("windows-1252");
    await expect(page.locator(".tool-preview td").first()).toHaveText("Renée");
  });

  test("turns Excel into a protected CSV with a chosen separator and columns", async ({
    page
  }) => {
    await openTool(page, "csv-converter");
    await openFile(page, "csv-input", fixture("staff.xlsx"));
    await expect(
      page.getByRole("button", {name: "CSV", exact: true})
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Last Name").uncheck();
    await page.getByLabel("Separate columns with").selectOption(";");
    await page.getByRole("button", {name: "Convert", exact: true}).click();
    const csv = await saveDownload(page, () =>
      page.getByRole("button", {name: "Download CSV"}).click()
    );
    expect(csv.name).toBe("staff.csv");
    expect(csv.bytes.toString("utf8")).toBe(
      "﻿Employee ID;First Name;PIN\r\n007;Parth;400001\r\n012;Rahul;411001\r\n123;Amit;400601"
    );
  });

  test("stops formulas in CSV files", async ({page}) => {
    await openTool(page, "csv-converter");
    await openFile(page, "csv-input", fixture("formulas.csv"));
    await page.getByRole("button", {name: "CSV", exact: true}).click();
    await page.getByRole("button", {name: "Convert", exact: true}).click();
    await expect(page.getByText(/saved with a ' in front/)).toBeVisible();
    const csv = await saveDownload(page, () =>
      page.getByRole("button", {name: "Download CSV"}).click()
    );
    const text = csv.bytes.toString("utf8");
    expect(text).toContain(`'=HYPERLINK(""http://example.com"")`);
    expect(text).toContain("012,Rahul,-5");
  });
});
