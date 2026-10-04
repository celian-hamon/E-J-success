// A course meets on some ISO weekdays (1 = Monday … 7 = Sunday), stored as "1,3,5".
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function parseClassDays(raw: string | null | undefined): number[] {
  return (raw ?? "")
    .split(",")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
}

export function serializeClassDays(days: Iterable<number>) {
  return [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort().join(",");
}

export function isoWeekday(date = new Date()) {
  return ((date.getDay() + 6) % 7) + 1;
}

export function meetsOn(classDays: string | null | undefined, date = new Date()) {
  return parseClassDays(classDays).includes(isoWeekday(date));
}

/** A Monday-based reference date for formatting weekday names with Intl. */
export function weekdayDate(day: number) {
  return new Date(2024, 0, day); // 1 Jan 2024 was a Monday
}
