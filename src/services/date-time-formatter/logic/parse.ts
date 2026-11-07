import {nfc} from "../../../shared/text/normalize";
import {CivilDate, fromDayNumber, isValidDate} from "./civil";
import {formatCount} from "../../../shared/text/numbers";

export interface TimeOfDay {
  h: number;
  mi: number;
  s: number;
}

/** A date, a time, or both. */
export interface DateTimeValue {
  date: CivilDate | null;
  time: TimeOfDay | null;
}

export type Order = "dmy" | "mdy";

export type Parsed =
  | {status: "ok"; value: DateTimeValue; notes: string[]}
  /** Numbers like 05/06/2026 that read as a date both ways. */
  | {
      status: "ambiguous";
      dmy: DateTimeValue;
      mdy: DateTimeValue;
      notes: string[];
    }
  | {status: "invalid"; reason: string};

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const MONTH_LOOKUP = new Map<string, number>();
MONTHS.forEach((name, i) => {
  MONTH_LOOKUP.set(name.toLowerCase(), i + 1);
  MONTH_LOOKUP.set(name.slice(0, 3).toLowerCase(), i + 1);
});
MONTH_LOOKUP.set("sept", 9);

const WEEKDAY =
  /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|nesday|rsday|urday|sday)?\.?,?\s+/i;

export const TWO_DIGIT_YEAR_RULE =
  "Two-digit years 00–29 are read as 2000–2029, and 30–99 as 1930–1999 (the same rule as Excel).";

/* Excel's largest date, 31/12/9999. */
const MAX_SERIAL = 2958465;

function fullYear(text: string, notes: string[]): number {
  const n = Number(text);
  if (text.length > 2) return n;
  const y = n < 30 ? 2000 + n : 1900 + n;
  notes.push(`Year “${text}” read as ${y}.`);
  return y;
}

/* "14:30", "2:30 PM", "2pm", "14:30:15", with an optional time zone that is
   ignored. Returns the time and what's left before it. */
function splitTime(
  text: string
): {rest: string; time: TimeOfDay | null; notes: string[]} | {error: string} {
  const notes: string[] = [];
  const re =
    /(^|[\sT,])(\d{1,2})(?::(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*([ap])?\.?\s*(m)?\.?\s*(z|utc|gmt|[+-]\d{2}:?\d{2})?$/i;
  const match = text.match(re);
  if (!match) return {rest: text, time: null, notes};
  const [whole, lead, hText, miText, sText, ampm, mLetter, zone] = match;
  const hasColon = miText !== undefined;
  const hasAmPm = ampm !== undefined && mLetter !== undefined;
  // A lone number ("2026", or the "26" in 7/11/26) isn't a time.
  if (!hasColon && !hasAmPm) return {rest: text, time: null, notes};
  if (ampm !== undefined && mLetter === undefined)
    return {rest: text, time: null, notes};
  let h = Number(hText);
  const mi = hasColon ? Number(miText) : 0;
  const s = sText !== undefined ? Number(sText) : 0;
  if (hasAmPm) {
    if (h < 1 || h > 12)
      return {error: `“${h}” isn't an hour on a 12-hour clock.`};
    if (ampm!.toLowerCase() === "a") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (h > 23) {
    return {error: `“${h}” isn't an hour (0–23).`};
  }
  if (mi > 59 || s > 59) return {error: "The minutes or seconds are over 59."};
  if (zone)
    notes.push("The time zone was ignored; the time is kept as written.");
  const rest = text
    .slice(0, text.length - whole.length + (lead ?? "").length)
    .replace(/(\d)T$/, "$1") // the T in 2026-11-07T14:30, not the t in "Oct"
    .replace(/[\s,]+$/, "");
  return {rest, time: {h, mi, s}, notes};
}

function dateOnly(
  y: number,
  m: number,
  d: number,
  time: TimeOfDay | null
): DateTimeValue {
  return {date: {y, m, d}, time};
}

function invalidReason(y: number, m: number, d: number): string {
  if (m < 1 || m > 12) return `There's no month ${m}.`;
  return `${MONTHS[m - 1]} ${y} has no day ${d}.`;
}

/* Reads one value. `order` decides numbers like 05/06/2026; without it,
   they come back as "ambiguous" with both readings. */
export function parseDateTime(raw: string, order: Order | null): Parsed {
  let text = nfc(raw).trim();
  if (text === "") return {status: "invalid", reason: "Empty."};

  // Excel date numbers: 46333 (a date) or 46333.5 (with a time).
  if (/^\d{1,7}(\.\d+)?$/.test(text) && !/^(19|20)\d{6}$/.test(text)) {
    const serial = Number(text);
    if (serial < 1 || serial > MAX_SERIAL) {
      return {
        status: "invalid",
        reason: "This number is too big or small to be an Excel date number."
      };
    }
    if (Math.floor(serial) === 60) {
      return {
        status: "invalid",
        reason: "Excel date number 60 is 29 February 1900, which doesn't exist."
      };
    }
    const whole = Math.floor(serial);
    // Excel counts from 1 = 1 Jan 1900 and wrongly includes 29 Feb 1900.
    const date = fromDayNumber(whole - (whole > 60 ? 25569 : 25568));
    const fraction = serial - whole;
    let time: TimeOfDay | null = null;
    if (fraction > 0) {
      const secs = Math.round(fraction * 86400) % 86400;
      time = {
        h: Math.floor(secs / 3600),
        mi: Math.floor((secs % 3600) / 60),
        s: secs % 60
      };
    }
    return {
      status: "ok",
      value: {date, time},
      notes: ["Read as an Excel date number."]
    };
  }

  const timed = splitTime(text);
  if ("error" in timed) return {status: "invalid", reason: timed.error};
  const {time} = timed;
  const notes = [...timed.notes];
  text = timed.rest.replace(WEEKDAY, "").trim();
  if (text === "") {
    return time
      ? {status: "ok", value: {date: null, time}, notes}
      : {status: "invalid", reason: "Empty."};
  }

  let m: RegExpMatchArray | null;

  // 2026-11-07, 2026/11/7, 2026.11.07
  if ((m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDate(y, mo, d)
      ? {status: "ok", value: dateOnly(y, mo, d, time), notes}
      : {status: "invalid", reason: invalidReason(y, mo, d)};
  }

  // 20261107
  if ((m = text.match(/^((?:19|20)\d{2})(\d{2})(\d{2})$/))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDate(y, mo, d)
      ? {status: "ok", value: dateOnly(y, mo, d, time), notes}
      : {status: "invalid", reason: invalidReason(y, mo, d)};
  }

  // 07/11/2026, 7-11-26, 07.11.2026 — day/month order needed.
  if ((m = text.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(m[3]!, notes);
    const dmyOk = isValidDate(y, b, a);
    const mdyOk = isValidDate(y, a, b);
    if (order === "dmy" || (dmyOk && !mdyOk && order === null)) {
      return dmyOk
        ? {status: "ok", value: dateOnly(y, b, a, time), notes}
        : {
            status: "invalid",
            reason: mdyOk
              ? "This only works with the month first, but day first was chosen."
              : invalidReason(y, b, a)
          };
    }
    if (order === "mdy" || (mdyOk && !dmyOk && order === null)) {
      return mdyOk
        ? {status: "ok", value: dateOnly(y, a, b, time), notes}
        : {
            status: "invalid",
            reason: dmyOk
              ? "This only works with the day first, but month first was chosen."
              : invalidReason(y, a, b)
          };
    }
    if (!dmyOk && !mdyOk)
      return {
        status: "invalid",
        reason: "These numbers don't make a date either way round."
      };
    if (a === b) return {status: "ok", value: dateOnly(y, b, a, time), notes};
    return {
      status: "ambiguous",
      dmy: dateOnly(y, b, a, time),
      mdy: dateOnly(y, a, b, time),
      notes
    };
  }

  // Month names: 7 Nov 2026, Nov 7, 2026, 7-Nov-26, 7th November 2026.
  const tokens = text
    .replace(/(\d)(st|nd|rd|th)\b/gi, "$1")
    .split(/[\s,/.-]+/)
    .filter(Boolean);
  const monthAt = tokens.findIndex(t => MONTH_LOOKUP.has(t.toLowerCase()));
  if (
    monthAt !== -1 &&
    tokens.length === 3 &&
    tokens.every((t, i) => i === monthAt || /^\d+$/.test(t))
  ) {
    const month = MONTH_LOOKUP.get(tokens[monthAt]!.toLowerCase())!;
    const others = tokens.filter((_, i) => i !== monthAt);
    let dayText: string;
    let yearText: string;
    if (others[0]!.length === 4)
      [yearText, dayText] = others as [string, string];
    else [dayText, yearText] = others as [string, string];
    if (dayText.length > 2)
      return {
        status: "invalid",
        reason: "Couldn't tell which number is the day."
      };
    const y = fullYear(yearText, notes);
    const d = Number(dayText);
    return isValidDate(y, month, d)
      ? {status: "ok", value: dateOnly(y, month, d, time), notes}
      : {status: "invalid", reason: invalidReason(y, month, d)};
  }

  return {
    status: "invalid",
    reason: "This isn't a date format the tool recognises."
  };
}

export interface OrderEvidence {
  /** A value that only works with the day first, e.g. 25/06/2026. */
  dayFirstExample: string | null;
  /** A value that only works with the month first, e.g. 06/25/2026. */
  monthFirstExample: string | null;
  /** How many values read as a date both ways. */
  ambiguousCount: number;
  ambiguousExample: string | null;
}

/* Looks at the whole list before converting anything, to find out whether
   numbers like 05/06/2026 are day-first or month-first. */
export function orderEvidence(values: readonly string[]): OrderEvidence {
  const evidence: OrderEvidence = {
    dayFirstExample: null,
    monthFirstExample: null,
    ambiguousCount: 0,
    ambiguousExample: null
  };
  for (const value of values) {
    const loose = parseDateTime(value, null);
    if (loose.status === "ambiguous") {
      evidence.ambiguousCount++;
      evidence.ambiguousExample ??= value.trim();
      continue;
    }
    if (loose.status !== "ok") continue;
    // Numeric dates that worked only one way are evidence.
    if (/^\s*\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4}\b/.test(value)) {
      const asDmy = parseDateTime(value, "dmy").status === "ok";
      const asMdy = parseDateTime(value, "mdy").status === "ok";
      if (asDmy && !asMdy) evidence.dayFirstExample ??= value.trim();
      if (asMdy && !asDmy) evidence.monthFirstExample ??= value.trim();
    }
  }
  return evidence;
}

export type OrderDecision =
  | {status: "decided"; order: Order | null; message: string | null}
  | {status: "ask"; reason: string};

/* Picks the day/month order, or says the person must choose. Never guesses. */
export function decideOrder(
  evidence: OrderEvidence,
  chosen: Order | "auto"
): OrderDecision {
  if (chosen !== "auto")
    return {status: "decided", order: chosen, message: null};
  const {
    dayFirstExample: dmy,
    monthFirstExample: mdy,
    ambiguousCount,
    ambiguousExample
  } = evidence;
  if (dmy && mdy) {
    return {
      status: "ask",
      reason: `This list has dates written both ways: “${dmy}” only works with the day first, and “${mdy}” only with the month first.`
    };
  }
  if (dmy) {
    return {
      status: "decided",
      order: "dmy",
      message: `Dates were read with the day first, because of values like “${dmy}”.`
    };
  }
  if (mdy) {
    return {
      status: "decided",
      order: "mdy",
      message: `Dates were read with the month first, because of values like “${mdy}”.`
    };
  }
  if (ambiguousCount > 0) {
    return {
      status: "ask",
      reason: `${formatCount(ambiguousCount)} ${
        ambiguousCount === 1 ? "date" : "dates"
      } could be read two ways. For example, “${ambiguousExample}” could be day first or month first.`
    };
  }
  return {status: "decided", order: null, message: null};
}
