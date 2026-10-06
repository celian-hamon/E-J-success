"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { parseAvatar } from "@/lib/gamification/avatar";
import { loadProgress } from "@/lib/gamification/progress";
import { AUDIENCES, parsePrivacy, sectionsFor, type Audience } from "@/lib/privacy";

export async function saveAvatar(formData: FormData) {
  const user = await requireUser();
  const { unlock } = await loadProgress(user.id);
  // Re-check unlocks on the server; locked parts silently fall back to defaults.
  const avatar = parseAvatar(String(formData.get("avatar") ?? ""), unlock);
  await db.user.update({ where: { id: user.id }, data: { avatar: JSON.stringify(avatar) } });
  revalidatePath("/", "layout");
  flash("/profile", "ok", (await getTranslations("flash"))("avatarSaved"));
}

/** Who sees each part of the public profile. Unknown values keep the default. */
export async function savePrivacy(formData: FormData) {
  const user = await requireUser();
  const current = await db.user.findUnique({ where: { id: user.id }, select: { privacy: true } });
  const privacy = parsePrivacy(current?.privacy);
  for (const s of sectionsFor(user.role)) {
    const v = formData.get(s);
    if (typeof v === "string" && (AUDIENCES as readonly string[]).includes(v)) privacy[s] = v as Audience;
  }
  await db.user.update({ where: { id: user.id }, data: { privacy: JSON.stringify(privacy) } });
  revalidatePath("/profile");
  revalidatePath(`/users/${user.id}`);
  flash("/profile", "ok", (await getTranslations("flash"))("privacySaved"));
}

export async function setLeaderboardVisibility(formData: FormData) {
  const user = await requireUser();
  const show = formData.get("show") === "true";
  await db.user.update({ where: { id: user.id }, data: { showOnLeaderboard: show } });
  revalidatePath("/profile");
  const t = await getTranslations("flash");
  flash("/profile", "ok", show ? t("leaderboardShown") : t("leaderboardHidden"));
}
