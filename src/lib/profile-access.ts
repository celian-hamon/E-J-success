import "server-only";
import { db } from "./db";
import { managedCoursesWhere, type SessionUser } from "./auth";
import type { Relation } from "./privacy";

/**
 * The viewer's relation to a profile owner. "class" covers classmates, the teachers of the
 * owner's courses, and (for a teacher's profile) the students of that teacher's courses.
 */
export async function relationTo(viewer: SessionUser, owner: { id: string; role: string; classId: string | null }): Promise<Relation> {
  if (viewer.id === owner.id) return "self";
  if (viewer.role === "ADMIN") return "admin";

  if (viewer.role === "STUDENT" && owner.role === "STUDENT") {
    if (!owner.classId) return "other";
    const me = await db.user.findUnique({ where: { id: viewer.id }, select: { classId: true } });
    return me?.classId === owner.classId ? "class" : "other";
  }
  if (viewer.role === "TEACHER" && owner.role === "STUDENT") {
    const n = await db.course.count({ where: { ...managedCoursesWhere(viewer.id), enrollments: { some: { userId: owner.id } } } });
    return n > 0 ? "class" : "other";
  }
  if (viewer.role === "STUDENT" && owner.role === "TEACHER") {
    const n = await db.course.count({ where: { ...managedCoursesWhere(owner.id), enrollments: { some: { userId: viewer.id } } } });
    return n > 0 ? "class" : "other";
  }
  return "other";
}
