import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth";
import { syncPet } from "@/lib/pet/engine";
import { isPetColor, PET_COLORS, PET_COLOR_KEYS, PET_RULES } from "@/lib/pet/rules";
import { isoWeekday, meetsOn, weekdayDate, WEEKDAYS } from "@/lib/schedule";
import PageHead from "@/components/PageHead";
import PetCare from "./PetCare";
import { updatePet } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pet"))("metaTitle") };
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="meter">
      <div className="spread" style={{ fontSize: 13 }}>
        <span>{label}</span>
        <span className="muted">{value}/100</span>
      </div>
      <div className="meter-track">
        <i style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

export default async function PetPage() {
  const user = await requireRole("STUDENT");
  const [t, format, state] = await Promise.all([getTranslations("pet"), getFormatter(), syncPet(user.id)]);
  const { pet, mood, stage, meals, courses } = state;
  const color = isPetColor(pet.color) ? pet.color : "teal";
  const todayIso = isoWeekday();

  return (
    <div className="app">
      <PageHead title={t.rich("title", { name: pet.name, tint: (c) => <em className="tint">{c}</em> })} subtitle={t("subtitle")} />

      <section className="panel glass intro intro-2">
        <PetCare
          name={pet.name}
          color={color}
          stage={stage.key}
          mood={mood}
          cuddled={state.cuddledToday}
          meals={meals.map((m) => ({ courseId: m.course.id, code: m.course.code, title: m.course.title, status: m.status }))}
        />
      </section>

      <div className="grid-2">
        <section className="panel glass">
          <h2>{t("stats")}</h2>
          <div className="stack" style={{ gap: 14 }}>
            <Meter label={t("fullness")} value={pet.fullness} color="linear-gradient(90deg,#ffb84d,#ff7a59)" />
            <Meter label={t("happiness")} value={pet.happiness} color="linear-gradient(90deg,#ff6fa8,#a896ff)" />
            <div className="row">
              <span className="chip">{t(`stages.${stage.key}`)}</span>
              <span className="chip">{t("mealsEaten", { count: pet.mealsEaten })}</span>
              {stage.nextAt !== null && <span className="chip">{t("nextStage", { count: stage.nextAt - pet.mealsEaten })}</span>}
            </div>
          </div>
        </section>

        <section className="panel glass">
          <h2>{t("week")}</h2>
          {courses.length === 0 ? (
            <div className="empty">{t("noSchedule")}</div>
          ) : (
            <div className="week-grid">
              {WEEKDAYS.map((d) => {
                const codes = courses.filter((c) => meetsOn(c.classDays, weekdayDate(d))).map((c) => c.code);
                return (
                  <div key={d} className={`week-day ${d === todayIso ? "today" : ""}`}>
                    {format.dateTime(weekdayDate(d), { weekday: "short" })}
                    <b>{codes.length ? codes.map(() => "🍎").join("") : "·"}</b>
                  </div>
                );
              })}
            </div>
          )}
          <p className="muted" style={{ fontSize: 13, margin: "14px 0 0" }}>
            {t("rules", { lose: PET_RULES.missedFullness })}
          </p>
        </section>
      </div>

      <section className="panel glass">
        <h2>{t("customize")}</h2>
        <form action={updatePet} className="row" style={{ alignItems: "end" }}>
          <label className="field" style={{ flex: 1, minWidth: 180 }}>
            <span>{t("name")}</span>
            <input className="input" name="name" defaultValue={pet.name} maxLength={20} />
          </label>
          <div className="field">
            <span>{t("color")}</span>
            <div className="row" style={{ gap: 8 }}>
              {PET_COLOR_KEYS.map((c) => (
                <label key={c} className="color-pick">
                  <input type="radio" name="color" value={c} defaultChecked={c === color} style={{ position: "absolute", opacity: 0 }} />
                  <span
                    className="color-dot"
                    style={{ display: "inline-block", background: `linear-gradient(135deg, ${PET_COLORS[c][0]}, ${PET_COLORS[c][1]})` }}
                    title={t(`colors.${c}`)}
                  />
                </label>
              ))}
            </div>
          </div>
          <button className="btn" type="submit">{t("save")}</button>
        </form>
      </section>
    </div>
  );
}
