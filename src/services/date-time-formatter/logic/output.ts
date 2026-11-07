import type {CivilDate} from "./civil";
import {toDayNumber, weekday} from "./civil";
import {DateTimeValue, MONTHS, TimeOfDay} from "./parse";

export type Clock = "24" | "12" | "none";

export const PRESET_FORMATS = [
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
  "DD-MM-YYYY",
  "DD MMM YYYY"
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

/* Letters a custom format can use (shown on the page). Text in [brackets]
   is kept as written. */
export const FORMAT_TOKENS: [string, string][] = [
  ["YYYY", "2026"],
  ["YY", "26"],
  ["MMMM", "November"],
  ["MMM", "Nov"],
  ["MM", "11"],
  ["M", "11 (no leading zero)"],
  ["DD", "07"],
  ["D", "7"],
  ["dddd", "Saturday"],
  ["ddd", "Sat"],
  ["HH", "14 (24-hour)"],
  ["hh", "02 (12-hour)"],
  ["h", "2"],
  ["mm", "30 (minutes)"],
  ["ss", "05"],
  ["A", "PM"]
];

const TOKEN =
  /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A/g;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/* Formats a date (and time) with a pattern like "DD MMM YYYY HH:mm". */
export function formatPattern(
  date: CivilDate,
  time: TimeOfDay | null,
  pattern: string
): string {
  const t = time ?? {h: 0, mi: 0, s: 0};
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  const day = WEEKDAYS[weekday(toDayNumber(date))]!;
  return pattern.replace(TOKEN, (token, literal: string | undefined) => {
    if (literal !== undefined) return literal;
    switch (token) {
      case "YYYY":
        return pad(date.y, 4);
      case "YY":
        return pad(date.y % 100);
      case "MMMM":
        return MONTHS[date.m - 1]!;
      case "MMM":
        return MONTHS[date.m - 1]!.slice(0, 3);
      case "MM":
        return pad(date.m);
      case "M":
        return String(date.m);
      case "DD":
        return pad(date.d);
      case "D":
        return String(date.d);
      case "dddd":
        return day;
      case "ddd":
        return day.slice(0, 3);
      case "HH":
        return pad(t.h);
      case "H":
        return String(t.h);
      case "hh":
        return pad(h12);
      case "h":
        return String(h12);
      case "mm":
        return pad(t.mi);
      case "ss":
        return pad(t.s);
      default:
        return t.h < 12 ? "AM" : "PM";
    }
  });
}

export function formatTime(time: TimeOfDay, clock: Clock): string {
  const seconds = time.s ? ":ss" : "";
  const pattern = clock === "12" ? `h:mm${seconds} A` : `HH:mm${seconds}`;
  return formatPattern({y: 2000, m: 1, d: 1}, time, pattern);
}

/* A value in the chosen date format, with its time (if it has one) in the
   chosen clock. Time-only values give just the time. */
export function formatValue(
  value: DateTimeValue,
  pattern: string,
  clock: Clock,
  customPattern: boolean
): string {
  if (!value.date)
    return formatTime(value.time!, clock === "none" ? "24" : clock);
  if (customPattern) return formatPattern(value.date, value.time, pattern);
  const date = formatPattern(value.date, null, pattern);
  return value.time && clock !== "none"
    ? `${date} ${formatTime(value.time, clock)}`
    : date;
}
