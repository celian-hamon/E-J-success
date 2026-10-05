import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { isRole, ROLE_HOME, type Role } from "./roles";

const COOKIE = "ejs_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type SessionUser = { id: string; name: string; email: string; role: Role };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is missing or too short (see .env.example)");
  return new TextEncoder().encode(s);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user, or null. Reads the user from the DB so role changes apply immediately. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user || !isRole(user.role)) return null;
    return { ...user, role: user.role };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Redirects to login when signed out, or to the user's own area when their role isn't allowed. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}

/**
 * Courses a teacher manages: the ones they're the named teacher of, plus every course of
 * the classes they're assigned to (a teacher can be assigned to any number of classes).
 */
export function managedCoursesWhere(teacherId: string) {
  return {
    OR: [{ teacherId }, { classLinks: { some: { class: { teachers: { some: { userId: teacherId } } } } } }],
  };
}

/** Admins manage every course; teachers manage their courses and their classes' courses. */
export async function canManageCourse(user: SessionUser, courseId: string) {
  if (user.role === "ADMIN") return true;
  if (user.role !== "TEACHER") return false;
  return (await db.course.count({ where: { id: courseId, ...managedCoursesWhere(user.id) } })) > 0;
}

export async function isEnrolled(userId: string, courseId: string) {
  const e = await db.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  return e !== null;
}
