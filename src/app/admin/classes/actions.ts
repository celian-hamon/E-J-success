"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { setStudentsClass, syncClassEnrollments } from "@/lib/classes";

// Blank or absent → null.
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null);

async function parseClass(formData: FormData) {
  const t = await getTranslations("flash");
  const ClassInput = z.object({
    name: z.string().trim().min(1, t("classNameRequired")),
    level: optionalText,
    schoolYear: optionalText,
  });
  return { parsed: ClassInput.safeParse(Object.fromEntries(formData)), t };
}

export async function createClass(formData: FormData) {
  await requireRole("ADMIN");
  const { parsed, t } = await parseClass(formData);
  if (!parsed.success) flash("/admin/classes", "error", parsed.error.issues[0].message);
  if (await db.schoolClass.findUnique({ where: { name: parsed.data.name } })) {
    flash("/admin/classes", "error", t("classNameTaken", { name: parsed.data.name }));
  }
  const cls = await db.schoolClass.create({ data: parsed.data });
  revalidatePath("/admin/classes");
  flash(`/admin/classes/${cls.id}`, "ok", t("classCreated"));
}

export async function updateClass(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const path = `/admin/classes/${id}`;
  const { parsed, t } = await parseClass(formData);
  if (!parsed.success) flash(path, "error", parsed.error.issues[0].message);
  const clash = await db.schoolClass.findUnique({ where: { name: parsed.data.name } });
  if (clash && clash.id !== id) flash(path, "error", t("classNameTaken", { name: parsed.data.name }));
  await db.schoolClass.update({ where: { id }, data: parsed.data });
  revalidatePath(path);
  flash(path, "ok", t("classSaved"));
}

export async function deleteClass(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  // Students are kept (their classId becomes null); enrollments derived from the class go with it.
  await db.schoolClass.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/admin/classes");
  flash("/admin/classes", "ok", t("classDeleted"));
}

export async function addStudentsToClass(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const classId = String(formData.get("classId"));
  const path = `/admin/classes/${classId}`;

  const ids = new Set(formData.getAll("studentId").map(String));
  const emails = String(formData.get("emails") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  let unknown: string[] = [];
  if (emails.length) {
    const found = await db.user.findMany({ where: { email: { in: emails }, role: "STUDENT" }, select: { id: true, email: true } });
    found.forEach((u) => ids.add(u.id));
    const foundEmails = new Set(found.map((u) => u.email));
    unknown = emails.filter((e) => !foundEmails.has(e));
  }
  const unknownMsg = unknown.length ? t("unknownStudents", { emails: unknown.join(", ") }) : "";
  if (ids.size === 0) flash(path, "error", unknownMsg || t("pickStudent"));

  await setStudentsClass([...ids], classId);
  revalidatePath(path);
  const msg = t("studentsAddedToClass", { count: ids.size });
  flash(path, unknown.length ? "error" : "ok", unknown.length ? `${msg} ${unknownMsg}` : msg);
}

export async function removeStudentFromClass(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const classId = String(formData.get("classId"));
  await setStudentsClass([String(formData.get("userId"))], null);
  revalidatePath(`/admin/classes/${classId}`);
  flash(`/admin/classes/${classId}`, "ok", t("studentRemovedFromClass"));
}

/** Assigns teachers to a class (a teacher can be in any number of classes). */
export async function addTeachersToClass(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const classId = String(formData.get("classId"));
  const path = `/admin/classes/${classId}`;
  const wanted = formData.getAll("teacherId").map(String);
  const teachers = await db.user.findMany({ where: { id: { in: wanted }, role: "TEACHER" }, select: { id: true } });
  if (!teachers.length) flash(path, "error", t("pickTeacher"));
  const have = new Set((await db.classTeacher.findMany({ where: { classId }, select: { userId: true } })).map((c) => c.userId));
  const add = teachers.filter((u) => !have.has(u.id));
  if (add.length) await db.classTeacher.createMany({ data: add.map((u) => ({ classId, userId: u.id })) });
  revalidatePath(path);
  flash(path, "ok", t("teachersAddedToClass", { count: add.length }));
}

export async function removeTeacherFromClass(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const classId = String(formData.get("classId"));
  await db.classTeacher.deleteMany({ where: { classId, userId: String(formData.get("userId")) } });
  revalidatePath(`/admin/classes/${classId}`);
  flash(`/admin/classes/${classId}`, "ok", t("teacherRemovedFromClass"));
}

export async function addCoursesToClass(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const classId = String(formData.get("classId"));
  const path = `/admin/classes/${classId}`;
  const courseIds = formData.getAll("courseId").map(String);
  if (!courseIds.length) flash(path, "error", t("pickCourse"));
  const existing = new Set((await db.classCourse.findMany({ where: { classId }, select: { courseId: true } })).map((c) => c.courseId));
  const toAdd = courseIds.filter((id) => !existing.has(id));
  if (toAdd.length) await db.classCourse.createMany({ data: toAdd.map((courseId) => ({ classId, courseId })) });
  await syncClassEnrollments(classId);
  revalidatePath(path);
  flash(path, "ok", t("coursesAddedToClass", { count: toAdd.length }));
}

export async function removeCourseFromClass(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const classId = String(formData.get("classId"));
  const courseId = String(formData.get("courseId"));
  await db.classCourse.delete({ where: { classId_courseId: { classId, courseId } } });
  await syncClassEnrollments(classId);
  revalidatePath(`/admin/classes/${classId}`);
  flash(`/admin/classes/${classId}`, "ok", t("courseRemovedFromClass"));
}
