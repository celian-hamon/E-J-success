"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { dayKey } from "@/lib/gamification/streak";
import { syncPet } from "@/lib/pet/engine";
import { clamp, isPetColor, PET_RULES } from "@/lib/pet/rules";

export async function feedPet(courseId: string) {
  const user = await requireRole("STUDENT");
  const { pet } = await syncPet(user.id);
  const meal = await db.petMeal.findUnique({
    where: { userId_courseId_day: { userId: user.id, courseId, day: dayKey() } },
  });
  if (!meal || meal.fedAt) return { ok: false };
  await db.$transaction([
    db.petMeal.update({ where: { id: meal.id }, data: { fedAt: new Date() } }),
    db.pet.update({
      where: { id: pet.id },
      data: {
        fullness: clamp(pet.fullness + PET_RULES.feedFullness),
        happiness: clamp(pet.happiness + PET_RULES.feedHappiness),
        mealsEaten: { increment: 1 },
      },
    }),
  ]);
  revalidatePath("/student/pet");
  revalidatePath("/student");
  return { ok: true };
}

export async function cuddlePet() {
  const user = await requireRole("STUDENT");
  const { pet, today } = await syncPet(user.id);
  if (pet.lastCuddleDay === today) return { ok: false };
  await db.pet.update({
    where: { id: pet.id },
    data: { happiness: clamp(pet.happiness + PET_RULES.cuddleHappiness), lastCuddleDay: today },
  });
  revalidatePath("/student/pet");
  return { ok: true };
}

export async function updatePet(formData: FormData) {
  const user = await requireRole("STUDENT");
  const { pet } = await syncPet(user.id);
  const name = String(formData.get("name") ?? "").trim().slice(0, 20) || pet.name;
  const color = formData.get("color");
  await db.pet.update({ where: { id: pet.id }, data: { name, color: isPetColor(color) ? color : pet.color } });
  revalidatePath("/student/pet");
}
