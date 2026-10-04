import "server-only";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/gamification/streak";
import { meetsOn } from "@/lib/schedule";
import { clamp, moodFor, PET_RULES, stageFor } from "./rules";

function dateOf(day: string) {
  return new Date(`${day}T12:00:00`); // midday avoids DST edge cases
}

function addDays(day: string, n: number) {
  const d = dateOf(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Enrolled courses that can feed the pet: they have a schedule and at least one published quiz. */
async function feedingCourses(userId: string) {
  const enrollments = await db.enrollment.findMany({
    where: { userId, course: { classDays: { not: "" }, quizzes: { some: { published: true } } } },
    select: { course: { select: { id: true, code: true, title: true, classDays: true } } },
    orderBy: { course: { code: "asc" } },
  });
  return enrollments.map((e) => e.course);
}

/**
 * Loads the pet (creating it on first visit) and applies every missed meal since the
 * last visit. State is computed lazily, so no cron job is needed.
 */
export async function syncPet(userId: string) {
  const today = dayKey();
  const yesterday = addDays(today, -1);
  let pet = await db.pet.findUnique({ where: { userId } });
  if (!pet) pet = await db.pet.create({ data: { userId, lastTickDay: yesterday } });

  const courses = await feedingCourses(userId);

  if (pet.lastTickDay && pet.lastTickDay < yesterday) {
    let from = addDays(pet.lastTickDay, 1);
    const earliest = addDays(yesterday, -(PET_RULES.maxCatchUpDays - 1));
    if (from < earliest) from = earliest;

    const meals = await db.petMeal.findMany({
      where: { userId, day: { gte: from, lte: yesterday } },
      select: { day: true, courseId: true, fedAt: true },
    });
    let { fullness, happiness, mealsEaten } = pet;
    for (let d = from; d <= yesterday; d = addDays(d, 1)) {
      const scheduled = courses.filter((c) => meetsOn(c.classDays, dateOf(d)));
      if (scheduled.length === 0) {
        happiness += PET_RULES.restDayHappiness;
        continue;
      }
      const earned = meals.filter((m) => m.day === d && scheduled.some((c) => c.id === m.courseId));
      // Meals earned but never hand-fed are eaten overnight.
      const leftovers = earned.filter((m) => !m.fedAt).length;
      fullness += leftovers * (PET_RULES.feedFullness / 2);
      mealsEaten += leftovers;
      const missed = scheduled.length - earned.length;
      fullness -= missed * PET_RULES.missedFullness;
      happiness -= missed * PET_RULES.missedHappiness;
      if (missed === 0) happiness += PET_RULES.allFedBonus;
      fullness = clamp(fullness);
      happiness = clamp(happiness);
    }
    pet = await db.pet.update({
      where: { id: pet.id },
      data: { fullness: clamp(fullness), happiness: clamp(happiness), mealsEaten, lastTickDay: yesterday },
    });
    await db.petMeal.updateMany({ where: { userId, day: { lte: yesterday }, fedAt: null }, data: { fedAt: new Date() } });
  }

  const todayCourses = courses.filter((c) => meetsOn(c.classDays));
  const todayMeals = await db.petMeal.findMany({ where: { userId, day: today } });
  const meals = todayCourses.map((c) => {
    const meal = todayMeals.find((m) => m.courseId === c.id);
    return { course: c, status: !meal ? ("todo" as const) : meal.fedAt ? ("fed" as const) : ("ready" as const) };
  });

  return {
    pet,
    mood: moodFor(pet.fullness, pet.happiness),
    stage: stageFor(pet.mealsEaten),
    today,
    meals,
    courses,
    cuddledToday: pet.lastCuddleDay === today,
  };
}

export type PetState = Awaited<ReturnType<typeof syncPet>>;

/** Called when a quiz is completed: earns that course's meal if the class meets that day. */
export async function earnMeal(userId: string, courseId: string, attemptId: string, playedAt: Date) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { classDays: true } });
  if (!course || !meetsOn(course.classDays, playedAt)) return false;
  const day = dayKey(playedAt);
  const existing = await db.petMeal.findUnique({ where: { userId_courseId_day: { userId, courseId, day } } });
  if (existing) return false;
  await db.petMeal.create({ data: { userId, courseId, day, attemptId } });
  return true;
}
