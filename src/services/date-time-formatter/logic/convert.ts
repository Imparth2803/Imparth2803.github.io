import {addMonths, fromDayNumber, toDayNumber, workingDays} from "./civil";
import {Clock, formatValue} from "./output";
import {
  decideOrder,
  DateTimeValue,
  Order,
  orderEvidence,
  parseDateTime
} from "./parse";

export type ShiftUnit = "days" | "weeks" | "months";

export interface Shift {
  amount: number; // negative to subtract
  unit: ShiftUnit;
}

export interface Outcome {
  /** Converted text ("" when it couldn't be converted or was empty). */
  values: string[];
  note: string;
  problem: boolean;
  empty: boolean;
}

export type Converted =
  | {status: "ask"; reason: string}
  | {status: "done"; orderMessage: string | null; outcomes: Outcome[]};

export interface FormatSettings {
  order: Order | "auto";
  pattern: string;
  customPattern: boolean;
  clock: Clock;
  shift: Shift | null;
}

function shifted(
  value: DateTimeValue,
  shift: Shift,
  notes: string[]
): DateTimeValue {
  if (!value.date || shift.amount === 0) return value;
  if (shift.unit === "months") {
    const moved = addMonths(value.date, shift.amount);
    if (moved.clamped)
      notes.push("That month is shorter, so its last day was used.");
    return {...value, date: moved.date};
  }
  const days = shift.amount * (shift.unit === "weeks" ? 7 : 1);
  return {...value, date: fromDayNumber(toDayNumber(value.date) + days)};
}

/* Converts every value to the chosen format (after adding or subtracting,
   if asked). Stops and asks when the day/month order can't be known. */
export function convertDates(
  values: readonly string[],
  settings: FormatSettings
): Converted {
  const decision = decideOrder(orderEvidence(values), settings.order);
  if (decision.status === "ask") return decision;
  const outcomes = values.map((raw): Outcome => {
    if (raw.trim() === "")
      return {values: [""], note: "", problem: false, empty: true};
    const parsed = parseDateTime(raw, decision.order);
    if (parsed.status !== "ok") {
      return {
        values: [""],
        note:
          parsed.status === "invalid"
            ? parsed.reason
            : "Could be read two ways.",
        problem: true,
        empty: false
      };
    }
    const notes = [...parsed.notes];
    let value = parsed.value;
    if (settings.shift) {
      if (!value.date)
        notes.push("A time on its own can't have days or months added.");
      value = shifted(value, settings.shift, notes);
    }
    if (value.date && (value.date.y < 1 || value.date.y > 9999)) {
      return {
        values: [""],
        note: "The result is outside the years 1–9999.",
        problem: true,
        empty: false
      };
    }
    return {
      values: [
        formatValue(
          value,
          settings.pattern,
          settings.clock,
          settings.customPattern
        )
      ],
      note: notes.join(" "),
      problem: false,
      empty: false
    };
  });
  return {status: "done", orderMessage: decision.message, outcomes};
}

export interface BetweenSettings {
  order: Order | "auto";
  /** Days of the week that aren't working days (0 = Sunday ... 6 = Saturday). */
  weekend: number[];
  holidays: string[];
}

export type Between =
  | {status: "ask"; reason: string}
  | {status: "holiday-problems"; problems: string[]}
  | {status: "done"; orderMessage: string | null; outcomes: Outcome[]};

/* For each pair: days from start to end (end minus start) and working days
   (counting both, without weekends and holidays, like Excel's NETWORKDAYS). */
export function daysBetween(
  starts: readonly string[],
  ends: readonly string[],
  settings: BetweenSettings
): Between {
  const holidays = settings.holidays.filter(h => h.trim() !== "");
  const decision = decideOrder(
    orderEvidence([...starts, ...ends, ...holidays]),
    settings.order
  );
  if (decision.status === "ask") return decision;

  const holidayDays = new Set<number>();
  const problems: string[] = [];
  for (const h of holidays) {
    const parsed = parseDateTime(h, decision.order);
    if (parsed.status === "ok" && parsed.value.date)
      holidayDays.add(toDayNumber(parsed.value.date));
    else problems.push(h.trim());
  }
  if (problems.length) return {status: "holiday-problems", problems};

  const weekend = new Set(settings.weekend);
  const dayOf = (
    raw: string
  ): {day: number; notes: string[]} | {error: string} => {
    const parsed = parseDateTime(raw, decision.order);
    if (parsed.status === "invalid") return {error: parsed.reason};
    if (parsed.status === "ambiguous")
      return {error: "Could be read two ways."};
    if (!parsed.value.date) return {error: "A time on its own has no date."};
    return {day: toDayNumber(parsed.value.date), notes: parsed.notes};
  };

  const outcomes = starts.map((rawStart, i): Outcome => {
    const rawEnd = ends[i] ?? "";
    if (rawStart.trim() === "" && rawEnd.trim() === "") {
      return {values: ["", ""], note: "", problem: false, empty: true};
    }
    if (rawStart.trim() === "" || rawEnd.trim() === "") {
      return {
        values: ["", ""],
        note: "Needs both a start and an end date.",
        problem: true,
        empty: false
      };
    }
    const start = dayOf(rawStart);
    const end = dayOf(rawEnd);
    if ("error" in start)
      return {
        values: ["", ""],
        note: `Start: ${start.error}`,
        problem: true,
        empty: false
      };
    if ("error" in end)
      return {
        values: ["", ""],
        note: `End: ${end.error}`,
        problem: true,
        empty: false
      };
    return {
      values: [
        String(end.day - start.day),
        String(workingDays(start.day, end.day, weekend, holidayDays))
      ],
      note: [...start.notes, ...end.notes].join(" "),
      problem: false,
      empty: false
    };
  });
  return {status: "done", orderMessage: decision.message, outcomes};
}
