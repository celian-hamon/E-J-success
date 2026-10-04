import "server-only";
import { db } from "./db";

/**
 * Makes a class's derived enrollments match "every student of the class × every course
 * of the class". Direct enrollments (viaClassId = null) are never touched: a student
 * already enrolled directly keeps that row, and it survives leaving the class.
 * Call after any change to a class's students or courses.
 */
export async function syncClassEnrollments(classId: string) {
  const cls = await db.schoolClass.findUnique({
    where: { id: classId },
    select: { students: { select: { id: true } }, courses: { select: { courseId: true } } },
  });
  if (!cls) return;

  const wanted = new Set(cls.students.flatMap((s) => cls.courses.map((c) => `${s.id}|${c.courseId}`)));
  const derived = await db.enrollment.findMany({ where: { viaClassId: classId }, select: { id: true, userId: true, courseId: true } });

  const stale = derived.filter((e) => !wanted.has(`${e.userId}|${e.courseId}`)).map((e) => e.id);
  if (stale.length) await db.enrollment.deleteMany({ where: { id: { in: stale } } });

  const studentIds = cls.students.map((s) => s.id);
  const existing = await db.enrollment.findMany({
    where: { userId: { in: studentIds } },
    select: { userId: true, courseId: true },
  });
  const have = new Set(existing.map((e) => `${e.userId}|${e.courseId}`));
  const missing = [...wanted].filter((k) => !have.has(k));
  if (missing.length) {
    await db.enrollment.createMany({
      data: missing.map((k) => {
        const [userId, courseId] = k.split("|");
        return { userId, courseId, viaClassId: classId };
      }),
    });
  }
}

/** Moves students into a class (or out of any class with `null`) and resyncs every class involved. */
export async function setStudentsClass(studentIds: string[], classId: string | null) {
  if (!studentIds.length) return;
  const before = await db.user.findMany({
    where: { id: { in: studentIds }, role: "STUDENT" },
    select: { id: true, classId: true },
  });
  const ids = before.map((s) => s.id);
  await db.user.updateMany({ where: { id: { in: ids } }, data: { classId } });
  const touched = new Set(before.map((s) => s.classId).filter((c): c is string => Boolean(c)));
  if (classId) touched.add(classId);
  for (const c of touched) await syncClassEnrollments(c);
}
