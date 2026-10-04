import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { canManageCourse, getCurrentUser } from "@/lib/auth";
import { isGameMode, quizOptions } from "@/lib/game-modes";
import { isDifficulty } from "@/lib/difficulty";
import { ImportError, MAX_IMPORT_BYTES, parseQuizImport, storeImportImages } from "@/lib/quiz-import";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const [t, ti, tf] = await Promise.all([getTranslations("api"), getTranslations("import"), getTranslations("flash")]);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("signIn") }, { status: 401 });
  if (!(await canManageCourse(user, courseId))) {
    return NextResponse.json({ error: t("notYourCourse") }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: ti("chooseJson") }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: ti("tooLarge") }, { status: 400 });
  }

  /** "Question 3 · answer 2: …" so the teacher knows where to look in the file. */
  const describe = (err: ImportError) => {
    const where: string[] = [];
    for (let i = 0; i < err.path.length; i++) {
      const [key, index] = [err.path[i], err.path[i + 1]];
      if (key === "questions" && typeof index === "number") where.push(ti("whereQuestion", { n: index + 1 }));
      if (key === "choices" && typeof index === "number") where.push(ti("whereChoice", { n: index + 1 }));
      if (key === "image") where.push(ti("whereImage"));
      else if (typeof key === "string" && key !== "questions" && key !== "choices") where.push(`“${key}”`);
    }
    const code = err.code;
    const reason = code === "image" ? tf(`image_${err.mediaCode ?? "invalid"}`) : ti(`errors.${code}`, { detail: err.detail ?? "" });
    return where.length ? ti("located", { where: where.join(" · "), reason }) : reason;
  };

  let images: Awaited<ReturnType<typeof storeImportImages>> | null = null;
  try {
    const parsed = parseQuizImport(await file.text());
    images = await storeImportImages(parsed, user.id);
    const { idOf } = images;

    // Settings chosen in the form apply unless the file sets them.
    const modeField = form.get("mode");
    const difficultyField = form.get("difficulty");
    const quiz = await db.quiz.create({
      data: {
        courseId,
        title: parsed.title || file.name.replace(/\.json$/i, ""),
        description: parsed.description,
        mode: parsed.mode ?? (isGameMode(modeField) ? modeField : "classic"),
        difficulty: parsed.difficulty ?? (isDifficulty(difficultyField) ? difficultyField : "medium"),
        ...(parsed.secondsPerQuestion ? { secondsPerQuestion: parsed.secondsPerQuestion } : {}),
        ...quizOptions(form),
        sourceFileName: file.name,
        questions: {
          create: parsed.questions.map((q, i) => ({
            order: i,
            prompt: q.prompt,
            explanation: q.explanation,
            wrongFeedback: q.wrongFeedback,
            imageId: idOf(q.image),
            choices: {
              create: q.choices.map((c, j) => ({ order: j, text: c.text, isCorrect: c.isCorrect, imageId: idOf(c.image) })),
            },
          })),
        },
      },
    });
    return NextResponse.json({ quizId: quiz.id });
  } catch (err) {
    if (err instanceof ImportError) return NextResponse.json({ error: describe(err) }, { status: 400 });
    await images?.release();
    console.error("Quiz import failed", err);
    return NextResponse.json({ error: ti("failed") }, { status: 500 });
  }
}
