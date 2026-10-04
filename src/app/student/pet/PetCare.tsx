"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PetSprite from "@/components/PetSprite";
import type { Mood, PetColor, StageKey } from "@/lib/pet/rules";
import { cuddlePet, feedPet } from "./actions";

type Meal = { courseId: string; code: string; title: string; status: "todo" | "ready" | "fed" };

export default function PetCare({
  name,
  color,
  stage,
  mood,
  meals,
  cuddled,
}: {
  name: string;
  color: PetColor;
  stage: StageKey;
  mood: Mood;
  meals: Meal[];
  cuddled: boolean;
}) {
  const t = useTranslations("pet");
  const [eating, setEating] = useState(false);
  const [pending, start] = useTransition();
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  function feed(courseId: string) {
    start(async () => {
      const res = await feedPet(courseId);
      if (res.ok) {
        setEating(true);
        setTimeout(() => setEating(false), 1600);
      }
    });
  }

  return (
    <div className="grid-2">
      <div className="stack" style={{ justifyItems: "center", textAlign: "center" }}>
        <div className={`pet-stage ${eating ? "pet-eating" : ""}`}>
          <PetSprite stage={stage} mood={eating ? "happy" : mood} color={color} size={240} label={name} />
        </div>
        <h2 style={{ margin: 0, fontWeight: 300, fontSize: 30 }}>{name}</h2>
        <p className="muted" style={{ margin: 0 }}>{t(`moods.${mood}`)}</p>
        <button className="btn btn-sm" disabled={cuddled || pending || offline} onClick={() => start(async () => void (await cuddlePet()))}>
          {cuddled ? t("cuddled") : t("cuddle")}
        </button>
      </div>

      <div className="stack">
        <p className="panel-title" style={{ margin: 0 }}>{t("todayMeals")}</p>
        {meals.length === 0 ? (
          <div className="empty">{t("restDay")}</div>
        ) : (
          meals.map((m) => (
            <div key={m.courseId} className={`meal-row ${m.status}`}>
              <span className="meal-icon" aria-hidden="true">{m.status === "fed" ? "✓" : m.status === "ready" ? "🍎" : "🔒"}</span>
              <div>
                <strong style={{ fontWeight: 400 }}>{m.title}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {m.code} · {t(`mealStatus.${m.status}`)}
                </div>
              </div>
              {m.status === "ready" && (
                <button className="btn btn-bright btn-sm" disabled={pending || offline} onClick={() => feed(m.courseId)}>
                  {t("feed")}
                </button>
              )}
              {m.status === "todo" && (
                <Link className="btn btn-sm" href="/student">
                  {t("playQuiz")}
                </Link>
              )}
            </div>
          ))
        )}
        {offline && <p className="muted" style={{ fontSize: 13, margin: 0 }}>{t("offline")}</p>}
      </div>
    </div>
  );
}
