"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { isRole, ROLE_HOME } from "@/lib/roles";

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// `error` is a key under "login.errors" in messages/*.json.
export type LoginState = { error?: "missing" | "invalid" };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "missing" };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash)) || !isRole(user.role)) {
    return { error: "invalid" };
  }

  await createSession(user.id);
  redirect(ROLE_HOME[user.role]);
}

export async function logout() {
  await destroySession();
  redirect("/");
}
