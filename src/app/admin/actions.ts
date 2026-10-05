"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireRole } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { ROLES } from "@/lib/roles";
import { serializeClassDays } from "@/lib/schedule";
import { setStudentsClass, syncClassEnrollments } from "@/lib/classes";

// Blank or absent (a form may simply not have the field, e.g. the class page's quick create) → null.
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null);

/* ───────── users ───────── */

export async function createUser(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const UserInput = z.object({
    name: z.string().trim().min(1, t("nameRequired")),
    email: z.string().trim().toLowerCase().email(t("emailInvalid")),
    role: z.enum(ROLES),
    password: z.string().min(8, t("passwordShort")),
  });
  const parsed = UserInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) flash("/admin/users", "error", parsed.error.issues[0].message);
  const { password, ...data } = parsed.data;

  if (await db.user.findUnique({ where: { email: data.email } })) {
    flash("/admin/users", "error", t("emailTaken", { email: data.email }));
  }
  const created = await db.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
  const classId = String(formData.get("classId") ?? "");
  if (classId && data.role === "STUDENT") await setStudentsClass([created.id], classId);
  revalidatePath("/admin/users");
  flash("/admin/users", "ok", t("userCreated", { name: data.name }));
}

export async function deleteUser(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const id = String(formData.get("id"));
  if (id === admin.id) flash("/admin/users", "error", t("cantDeleteSelf"));
  await db.user.delete({ where: { id } });
  revalidatePath("/admin/users");
  flash("/admin/users", "ok", t("userDeleted"));
}

/* ───────── courses ───────── */

async function parseCourse(formData: FormData) {
  const t = await getTranslations("flash");
  const CourseInput = z.object({
    code: z.string().trim().toUpperCase().min(1, t("codeRequired")),
    title: z.string().trim().min(1, t("titleRequired")),
    description: optionalText,
    teacherId: optionalText,
  });
  const parsed = CourseInput.safeParse(Object.fromEntries(formData));
  const classDays = serializeClassDays(formData.getAll("classDays").map(Number));
  return { parsed, classDays, t };
}

export async function createCourse(formData: FormData) {
  await requireRole("ADMIN");
  // Created from a class page: link it to that class and go back there.
  const classId = String(formData.get("classId") ?? "") || null;
  const back = classId ? `/admin/classes/${classId}` : "/admin/courses";
  const { parsed, classDays, t } = await parseCourse(formData);
  if (!parsed.success) flash(back, "error", parsed.error.issues[0].message);
  if (await db.course.findUnique({ where: { code: parsed.data.code } })) {
    flash(back, "error", t("codeTaken", { code: parsed.data.code }));
  }
  const course = await db.course.create({ data: { ...parsed.data, classDays } });
  revalidatePath("/admin/courses");
  if (classId) {
    await db.classCourse.create({ data: { classId, courseId: course.id } });
    // The course's teacher now teaches this class too.
    if (course.teacherId) {
      await db.classTeacher.upsert({
        where: { classId_userId: { classId, userId: course.teacherId } },
        update: {},
        create: { classId, userId: course.teacherId },
      });
    }
    await syncClassEnrollments(classId);
    revalidatePath(back);
    flash(back, "ok", t("courseCreatedInClass", { code: course.code }));
  }
  flash(`/admin/courses/${course.id}`, "ok", t("courseCreated"));
}

/** Links a course to exactly the ticked classes (from the course page). */
export async function setCourseClasses(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const courseId = String(formData.get("courseId"));
  const path = `/admin/courses/${courseId}`;
  const wanted = new Set(formData.getAll("classId").map(String));
  const current = new Set((await db.classCourse.findMany({ where: { courseId }, select: { classId: true } })).map((l) => l.classId));
  const add = [...wanted].filter((id) => !current.has(id));
  const remove = [...current].filter((id) => !wanted.has(id));
  if (add.length) await db.classCourse.createMany({ data: add.map((classId) => ({ classId, courseId })) });
  if (remove.length) await db.classCourse.deleteMany({ where: { courseId, classId: { in: remove } } });
  for (const id of [...add, ...remove]) await syncClassEnrollments(id);
  revalidatePath(path);
  flash(path, "ok", t("courseClassesSaved"));
}

/** Bulk actions on the course list: add to / remove from a class, or set the teacher. */
export async function bulkCourses(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const back = String(formData.get("back") ?? "/admin/courses");
  const safeBack = back.startsWith("/admin/courses") ? back : "/admin/courses";
  const courseIds = formData.getAll("courseId").map(String);
  const op = String(formData.get("op"));
  if (!courseIds.length) flash(safeBack, "error", t("pickCourse"));

  if (op === "addClass" || op === "removeClass") {
    const classId = String(formData.get("classId") ?? "");
    if (!classId) flash(safeBack, "error", t("pickClass"));
    if (op === "addClass") {
      const have = new Set((await db.classCourse.findMany({ where: { classId }, select: { courseId: true } })).map((c) => c.courseId));
      const add = courseIds.filter((id) => !have.has(id));
      if (add.length) await db.classCourse.createMany({ data: add.map((courseId) => ({ classId, courseId })) });
    } else {
      await db.classCourse.deleteMany({ where: { classId, courseId: { in: courseIds } } });
    }
    await syncClassEnrollments(classId);
    revalidatePath("/admin/courses");
    flash(safeBack, "ok", op === "addClass" ? t("bulkAddedToClass", { count: courseIds.length }) : t("bulkRemovedFromClass", { count: courseIds.length }));
  }

  if (op === "setTeacher") {
    const teacherId = String(formData.get("teacherId") ?? "");
    const teacher = teacherId && teacherId !== "none" ? await db.user.findFirst({ where: { id: teacherId, role: "TEACHER" } }) : null;
    if (teacherId !== "none" && !teacher) flash(safeBack, "error", t("pickTeacher"));
    await db.course.updateMany({ where: { id: { in: courseIds } }, data: { teacherId: teacher?.id ?? null } });
    revalidatePath("/admin/courses");
    flash(safeBack, "ok", t("bulkTeacherSet", { count: courseIds.length }));
  }

  flash(safeBack, "error", t("pickAction"));
}

/**
 * Copies a course (details, timetable, teacher and every quiz as a draft) under a new
 * code. Students, classes and results are not copied. Handy for a new school year.
 */
export async function duplicateCourse(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const source = await db.course.findUnique({
    where: { id: String(formData.get("id")) },
    include: { quizzes: { include: { questions: { include: { choices: true } } } } },
  });
  if (!source) flash("/admin/courses", "error", t("courseGone"));

  let code = `${source.code}-COPIE`;
  for (let n = 2; await db.course.findUnique({ where: { code } }); n++) code = `${source.code}-COPIE${n}`;

  const copy = await db.course.create({
    data: {
      code,
      title: t("copyTitle", { title: source.title }),
      description: source.description,
      teacherId: source.teacherId,
      classDays: source.classDays,
      quizzes: {
        create: source.quizzes.map((q) => ({
          title: q.title,
          description: q.description,
          mode: q.mode,
          secondsPerQuestion: q.secondsPerQuestion,
          published: false,
          difficulty: q.difficulty,
          combo: q.combo,
          lives: q.lives,
          shuffleQuestions: q.shuffleQuestions,
          shuffleAnswers: q.shuffleAnswers,
          sourceFileName: q.sourceFileName,
          questions: {
            create: q.questions.map((qq) => ({
              order: qq.order,
              type: qq.type,
              data: qq.data,
              prompt: qq.prompt,
              explanation: qq.explanation,
              wrongFeedback: qq.wrongFeedback,
              imageId: qq.imageId, // images are shared, never edited in place
              choices: {
                create: qq.choices.map((c) => ({ order: c.order, text: c.text, isCorrect: c.isCorrect, group: c.group, imageId: c.imageId })),
              },
            })),
          },
        })),
      },
    },
  });
  revalidatePath("/admin/courses");
  flash(`/admin/courses/${copy.id}`, "ok", t("courseDuplicated", { code, count: source.quizzes.length }));
}

export async function updateCourse(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const path = `/admin/courses/${id}`;
  const { parsed, classDays, t } = await parseCourse(formData);
  if (!parsed.success) flash(path, "error", parsed.error.issues[0].message);
  const clash = await db.course.findUnique({ where: { code: parsed.data.code } });
  if (clash && clash.id !== id) flash(path, "error", t("codeTaken", { code: parsed.data.code }));
  await db.course.update({ where: { id }, data: { ...parsed.data, classDays } });
  revalidatePath(path);
  flash(path, "ok", t("courseSaved"));
}

export async function deleteCourse(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  await db.course.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/admin/courses");
  flash("/admin/courses", "ok", t("courseDeleted"));
}

/* ───────── enrollments ───────── */

export async function enrollStudents(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const courseId = String(formData.get("courseId"));
  const path = `/admin/courses/${courseId}`;

  const ids = new Set(formData.getAll("studentId").map(String));
  const emails = String(formData.get("emails") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  let unknown: string[] = [];
  if (emails.length) {
    const found = await db.user.findMany({
      where: { email: { in: emails }, role: "STUDENT" },
      select: { id: true, email: true },
    });
    found.forEach((u) => ids.add(u.id));
    const foundEmails = new Set(found.map((u) => u.email));
    unknown = emails.filter((e) => !foundEmails.has(e));
  }
  const unknownMsg = unknown.length ? t("unknownStudents", { emails: unknown.join(", ") }) : "";
  if (ids.size === 0) flash(path, "error", unknownMsg || t("pickStudent"));

  // Only students can be enrolled; skip anyone already in the course.
  const students = await db.user.findMany({ where: { id: { in: [...ids] }, role: "STUDENT" }, select: { id: true } });
  const existing = await db.enrollment.findMany({ where: { courseId }, select: { userId: true } });
  const already = new Set(existing.map((e) => e.userId));
  const toAdd = students.filter((s) => !already.has(s.id));
  if (toAdd.length) {
    await db.enrollment.createMany({ data: toAdd.map((s) => ({ userId: s.id, courseId })) });
  }
  // Picking someone who only had the course through their class makes it a direct
  // enrollment, so they keep it if they change class.
  await db.enrollment.updateMany({
    where: { courseId, userId: { in: students.map((s) => s.id) }, viaClassId: { not: null } },
    data: { viaClassId: null },
  });

  revalidatePath(path);
  const msg = t("studentsAssigned", { count: toAdd.length });
  flash(path, unknown.length ? "error" : "ok", unknown.length ? `${msg} ${unknownMsg}` : msg);
}

export async function unenrollStudent(formData: FormData) {
  await requireRole("ADMIN");
  const t = await getTranslations("flash");
  const courseId = String(formData.get("courseId"));
  const userId = String(formData.get("userId"));
  // Only direct enrollments can be removed here; class-based ones follow the class.
  await db.enrollment.deleteMany({ where: { userId, courseId, viaClassId: null } });
  // If their class also includes this course, they keep it through the class.
  const student = await db.user.findUnique({ where: { id: userId }, select: { classId: true } });
  if (student?.classId) await syncClassEnrollments(student.classId);
  revalidatePath(`/admin/courses/${courseId}`);
  flash(`/admin/courses/${courseId}`, "ok", t("studentRemoved"));
}
