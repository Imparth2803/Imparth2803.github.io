/* Calendar dates as plain year/month/day numbers, so no time zone can ever
   shift a date. Day numbers count days since 1970-01-01. */

export interface CivilDate {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return (
    [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
      m - 1
    ] ?? 0
  );
}

export function isValidDate(y: number, m: number, d: number): boolean {
  return (
    y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
  );
}

/* Howard Hinnant's days_from_civil. */
export function toDayNumber({y, m, d}: CivilDate): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return {y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d};
}

/* 0 = Sunday ... 6 = Saturday. 1970-01-01 was a Thursday. */
export function weekday(days: number): number {
  return ((days % 7) + 7 + 4) % 7;
}

/* Adds months; when the day doesn't exist in the new month (31 Jan + 1
   month), uses that month's last day and says so. */
export function addMonths(
  date: CivilDate,
  months: number
): {date: CivilDate; clamped: boolean} {
  const index = date.y * 12 + (date.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const last = daysInMonth(y, m);
  return {date: {y, m, d: Math.min(date.d, last)}, clamped: date.d > last};
}

/* Working days from start to end, counting both (like Excel's NETWORKDAYS).
   Negative when end is before start. */
export function workingDays(
  start: number,
  end: number,
  weekend: ReadonlySet<number>,
  holidays: ReadonlySet<number>
): number {
  if (end < start) return -workingDays(end, start, weekend, holidays);
  const total = end - start + 1;
  const weeks = Math.floor(total / 7);
  let count = weeks * (7 - weekend.size);
  for (let day = start + weeks * 7; day <= end; day++) {
    if (!weekend.has(weekday(day))) count++;
  }
  holidays.forEach(day => {
    if (day >= start && day <= end && !weekend.has(weekday(day))) count--;
  });
  return count;
}
