/**
 * Business-day arithmetic across offices that keep different working weeks.
 *
 * Riyadh works Sun–Thu (UTC+3), Dubai works Mon–Fri (UTC+4) and Bangalore
 * works Mon–Fri (UTC+5:30). "Respond within one business day" therefore
 * resolves to a different instant depending on who owns the enquiry, and a
 * naive `created + 24h` is wrong for all three.
 *
 * Everything in and out is a UTC `Date`; the timezone only ever exists inside
 * these functions. No dependency on a date library — `Intl` already knows the
 * IANA database.
 */

export interface WorkingCalendar {
  /** IANA timezone, e.g. "Asia/Riyadh". */
  timezone: string;
  /** JS day numbers that are working days (0 = Sunday … 6 = Saturday). */
  workingDays: number[];
  workStartHour: number;
  workEndHour: number;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Break a UTC instant into wall-clock parts as seen in `timezone`. */
export function getZonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some ICU versions; normalise it.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday],
  };
}

/** Offset of `timezone` from UTC, in milliseconds, at the given instant. */
function getOffsetMs(date: Date, timezone: string): number {
  const p = getZonedParts(date, timezone);
  const asIfUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asIfUtc - date.getTime();
}

/**
 * Convert a wall-clock time in `timezone` to the corresponding UTC instant.
 * Resolved in two passes so a DST transition between the guess and the real
 * offset still lands correctly. (The three offices here observe no DST, but
 * the helper is used generally.)
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffset = getOffsetMs(new Date(guess), timezone);
  let timestamp = guess - firstOffset;

  const secondOffset = getOffsetMs(new Date(timestamp), timezone);
  if (secondOffset !== firstOffset) {
    timestamp = guess - secondOffset;
  }

  return new Date(timestamp);
}

export function isWorkingDay(date: Date, calendar: WorkingCalendar): boolean {
  const { weekday } = getZonedParts(date, calendar.timezone);
  return calendar.workingDays.includes(weekday);
}

/** `YYYY-MM-DD` for a date whose UTC fields carry the intended calendar day. */
export function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * End of business on the Nth working day *after* the day `from` falls on.
 *
 * The arrival day never counts, so an enquiry landing Thursday 17:00 in Riyadh
 * (Sun–Thu week) is due Sunday 18:00 AST — not Friday.
 *
 * `holidays` is an optional list of `YYYY-MM-DD` dates in the calendar's own
 * timezone that should not count as working days. It is deliberately a plain
 * list rather than a lookup: no holiday calendar exists yet, and this exists so
 * that adding one later is a data change rather than a signature change across
 * every caller.
 */
export function addBusinessDays(
  from: Date,
  businessDays: number,
  calendar: WorkingCalendar,
  holidays: readonly string[] = [],
): Date {
  if (businessDays < 1) {
    throw new Error('businessDays must be at least 1');
  }
  if (calendar.workingDays.length === 0) {
    throw new Error('WorkingCalendar must define at least one working day');
  }

  const holidaySet = new Set(holidays);

  const start = getZonedParts(from, calendar.timezone);

  // Walk forward a day at a time in the office's local calendar, counting only
  // working days. Capped well above any realistic weekend or holiday run.
  const maxIterations = businessDays * 7 + 14;
  let counted = 0;
  let cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));

  for (let i = 0; i < maxIterations && counted < businessDays; i++) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const weekday = cursor.getUTCDay();
    if (
      calendar.workingDays.includes(weekday) &&
      !holidaySet.has(toIsoDate(cursor))
    ) {
      counted++;
    }
  }

  if (counted < businessDays) {
    throw new Error('Could not resolve a due date from the working calendar');
  }

  return zonedTimeToUtc(
    cursor.getUTCFullYear(),
    cursor.getUTCMonth() + 1,
    cursor.getUTCDate(),
    calendar.workEndHour,
    0,
    calendar.timezone,
  );
}
