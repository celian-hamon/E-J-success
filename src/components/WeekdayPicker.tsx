import { getFormatter } from "next-intl/server";
import { WEEKDAYS, parseClassDays, weekdayDate } from "@/lib/schedule";

/** Checkboxes named "classDays" for the days a course meets. */
export default async function WeekdayPicker({ value }: { value?: string }) {
  const format = await getFormatter();
  const selected = new Set(parseClassDays(value));
  return (
    <div className="row" style={{ gap: 6 }}>
      {WEEKDAYS.map((d) => (
        <label key={d} className="day-chip">
          <input type="checkbox" name="classDays" value={d} defaultChecked={selected.has(d)} />
          <span>{format.dateTime(weekdayDate(d), { weekday: "short" })}</span>
        </label>
      ))}
    </div>
  );
}

export async function ClassDaysLabel({ value }: { value: string }) {
  const format = await getFormatter();
  const days = parseClassDays(value);
  return <>{days.map((d) => format.dateTime(weekdayDate(d), { weekday: "short" })).join(" · ")}</>;
}
