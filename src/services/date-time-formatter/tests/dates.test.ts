import {
  addMonths,
  fromDayNumber,
  toDayNumber,
  weekday,
  workingDays
} from "../logic/civil";
import {convertDates, daysBetween, FormatSettings} from "../logic/convert";
import {formatPattern} from "../logic/output";
import {decideOrder, orderEvidence, parseDateTime} from "../logic/parse";

const iso: FormatSettings = {
  order: "auto",
  pattern: "YYYY-MM-DD",
  customPattern: false,
  clock: "24",
  shift: null
};
const results = (values: string[], settings: Partial<FormatSettings> = {}) => {
  const out = convertDates(values, {...iso, ...settings});
  if (out.status !== "done") throw new Error(out.reason);
  return out.outcomes.map(o => (o.problem ? `!${o.note}` : o.values[0]));
};

describe("calendar maths", () => {
  it("round-trips day numbers and knows weekdays", () => {
    for (const date of [
      {y: 1970, m: 1, d: 1},
      {y: 2000, m: 2, d: 29},
      {y: 2026, m: 11, d: 7},
      {y: 1, m: 1, d: 1}
    ]) {
      expect(fromDayNumber(toDayNumber(date))).toEqual(date);
    }
    expect(weekday(toDayNumber({y: 2026, m: 11, d: 7}))).toBe(6); // Saturday
  });

  it("uses the last day of shorter months", () => {
    expect(addMonths({y: 2026, m: 1, d: 31}, 1)).toEqual({
      date: {y: 2026, m: 2, d: 28},
      clamped: true
    });
    expect(addMonths({y: 2024, m: 1, d: 31}, 1).date).toEqual({
      y: 2024,
      m: 2,
      d: 29
    });
    expect(addMonths({y: 2026, m: 3, d: 15}, -3)).toEqual({
      date: {y: 2025, m: 12, d: 15},
      clamped: false
    });
  });

  it("counts working days like Excel's NETWORKDAYS", () => {
    const day = (d: number) => toDayNumber({y: 2026, m: 11, d});
    const satSun = new Set([0, 6]);
    expect(workingDays(day(2), day(6), satSun, new Set())).toBe(5); // Mon–Fri
    expect(workingDays(day(2), day(15), satSun, new Set())).toBe(10);
    expect(workingDays(day(2), day(6), satSun, new Set([day(4)]))).toBe(4);
    expect(workingDays(day(6), day(2), satSun, new Set())).toBe(-5);
    expect(workingDays(day(6), day(7), new Set([5, 6]), new Set())).toBe(0); // Fri–Sat weekend
  });
});

describe("reading dates", () => {
  it("reads the requirements examples", () => {
    expect(
      results(["07/11/2026", "7 Nov 2026", "2026.11.07"], {order: "dmy"})
    ).toEqual(["2026-11-07", "2026-11-07", "2026-11-07"]);
  });

  it("reads many common formats", () => {
    expect(
      results([
        "Nov 7, 2026",
        "7th November 2026",
        "Saturday, 7 November 2026",
        "7-Nov-26",
        "20261107",
        "2026-11-07T14:30:00Z",
        "46333",
        "Sept 7 2026"
      ])
    ).toEqual([
      "2026-11-07",
      "2026-11-07",
      "2026-11-07",
      "2026-11-07",
      "2026-11-07",
      "2026-11-07 14:30",
      "2026-11-07",
      "2026-09-07"
    ]);
  });

  it("explains how unusual values were read", () => {
    const parsed = parseDateTime("7/11/26 2:30 pm", "dmy");
    expect(parsed).toEqual({
      status: "ok",
      value: {date: {y: 2026, m: 11, d: 7}, time: {h: 14, mi: 30, s: 0}},
      notes: ["Year “26” read as 2026."]
    });
    expect(parseDateTime("45000", null)).toMatchObject({
      notes: ["Read as an Excel date number."]
    });
    expect(parseDateTime("7/11/45", "dmy")).toMatchObject({
      value: {date: {y: 1945}}
    });
  });

  it("handles Excel's 1900 leap-year mistake", () => {
    expect(parseDateTime("59", null)).toMatchObject({
      value: {date: {y: 1900, m: 2, d: 28}}
    });
    expect(parseDateTime("60", null).status).toBe("invalid");
    expect(parseDateTime("61", null)).toMatchObject({
      value: {date: {y: 1900, m: 3, d: 1}}
    });
    expect(parseDateTime("1", null)).toMatchObject({
      value: {date: {y: 1900, m: 1, d: 1}}
    });
  });

  it("flags values that aren't dates, with a reason", () => {
    expect(
      results(["31/02/2026", "hello", "2026-13-01", "25:00"], {order: "dmy"})
    ).toEqual([
      "!February 2026 has no day 31.",
      "!This isn't a date format the tool recognises.",
      "!There's no month 13.",
      "!“25” isn't an hour (0–23)."
    ]);
  });

  it("leaves empty values empty without calling them problems", () => {
    const out = convertDates(["", "2026-11-07"], iso);
    expect(out.status === "done" && out.outcomes[0]).toMatchObject({
      empty: true,
      problem: false
    });
  });
});

describe("never guessing the day/month order", () => {
  it("asks when every numeric date could be read both ways", () => {
    const out = convertDates(["05/06/2026", "01/02/2026"], iso);
    expect(out.status).toBe("ask");
  });

  it("uses a value that settles it, and says which", () => {
    const out = convertDates(["05/06/2026", "25/06/2026"], iso);
    expect(out).toMatchObject({
      status: "done",
      orderMessage:
        "Dates were read with the day first, because of values like “25/06/2026”."
    });
    expect(results(["05/06/2026", "25/06/2026"])).toEqual([
      "2026-06-05",
      "2026-06-25"
    ]);
    expect(results(["05/06/2026", "06/25/2026"])).toEqual([
      "2026-05-06",
      "2026-06-25"
    ]);
  });

  it("asks when the list mixes both orders", () => {
    expect(
      decideOrder(orderEvidence(["25/06/2026", "06/25/2026"]), "auto").status
    ).toBe("ask");
  });

  it("doesn't ask when nothing is ambiguous", () => {
    expect(
      convertDates(["2026-11-07", "7 Nov 2026", "11/11/2026"], iso).status
    ).toBe("done");
  });

  it("flags values that don't fit the chosen order", () => {
    expect(results(["25/06/2026"], {order: "mdy"})).toEqual([
      "!This only works with the day first, but month first was chosen."
    ]);
  });
});

describe("output", () => {
  it("writes every preset and custom formats", () => {
    const date = {y: 2026, m: 11, d: 7};
    const time = {h: 14, mi: 5, s: 9};
    expect(formatPattern(date, null, "DD/MM/YYYY")).toBe("07/11/2026");
    expect(formatPattern(date, null, "MM/DD/YYYY")).toBe("11/07/2026");
    expect(formatPattern(date, null, "DD-MM-YYYY")).toBe("07-11-2026");
    expect(formatPattern(date, null, "DD MMM YYYY")).toBe("07 Nov 2026");
    expect(formatPattern(date, time, "dddd, D MMMM YY [at] h:mm:ss A")).toBe(
      "Saturday, 7 November 26 at 2:05:09 PM"
    );
  });

  it("converts between 12- and 24-hour clocks", () => {
    expect(
      results(["2:30 PM", "14:30", "12:05 am", "7 Nov 2026 9:00"], {
        clock: "12"
      })
    ).toEqual(["2:30 PM", "2:30 PM", "12:05 AM", "2026-11-07 9:00 AM"]);
    expect(results(["2:30 PM", "12:00 PM"], {clock: "24"})).toEqual([
      "14:30",
      "12:00"
    ]);
    expect(results(["7 Nov 2026 9:00"], {clock: "none"})).toEqual([
      "2026-11-07"
    ]);
  });

  it("adds and subtracts days, weeks and months", () => {
    expect(
      results(["2026-01-31"], {shift: {amount: 1, unit: "months"}})
    ).toEqual(["2026-02-28"]);
    expect(
      results(["2026-11-07"], {shift: {amount: -2, unit: "weeks"}})
    ).toEqual(["2026-10-24"]);
    expect(results(["2026-12-31"], {shift: {amount: 1, unit: "days"}})).toEqual(
      ["2027-01-01"]
    );
    const out = convertDates(["2026-01-31"], {
      ...iso,
      shift: {amount: 1, unit: "months"}
    });
    expect(out.status === "done" && out.outcomes[0]!.note).toBe(
      "That month is shorter, so its last day was used."
    );
  });
});

describe("days between dates", () => {
  const settings = {order: "dmy" as const, weekend: [0, 6], holidays: []};

  it("counts calendar and working days", () => {
    const out = daysBetween(
      ["02/11/2026", "06/11/2026"],
      ["06/11/2026", "02/11/2026"],
      settings
    );
    expect(out.status === "done" && out.outcomes.map(o => o.values)).toEqual([
      ["4", "5"],
      ["-4", "-5"]
    ]);
  });

  it("leaves out holidays and reports holidays it can't read", () => {
    const out = daysBetween(["02/11/2026"], ["06/11/2026"], {
      ...settings,
      holidays: ["04/11/2026", ""]
    });
    expect(out.status === "done" && out.outcomes[0]!.values).toEqual([
      "4",
      "4"
    ]);
    expect(
      daysBetween(["02/11/2026"], ["06/11/2026"], {
        ...settings,
        holidays: ["Diwali"]
      })
    ).toEqual({
      status: "holiday-problems",
      problems: ["Diwali"]
    });
  });

  it("explains missing or unreadable dates", () => {
    const out = daysBetween(
      ["02/11/2026", "x", ""],
      ["", "06/11/2026", ""],
      settings
    );
    expect(out.status === "done" && out.outcomes.map(o => o.note)).toEqual([
      "Needs both a start and an end date.",
      "Start: This isn't a date format the tool recognises.",
      ""
    ]);
  });
});
