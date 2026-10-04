import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// Local development accounts. Change or delete these before deploying.
const USERS = [
  { email: "admin@ejsuccess.test", name: "Ada Admin", role: "ADMIN", password: "admin1234" },
  { email: "teacher@ejsuccess.test", name: "Tomas Teacher", role: "TEACHER", password: "teacher1234" },
  { email: "sam@ejsuccess.test", name: "Sam Student", role: "STUDENT", password: "student1234" },
  { email: "lea@ejsuccess.test", name: "Lea Student", role: "STUDENT", password: "student1234" },
  { email: "noah@ejsuccess.test", name: "Noah Student", role: "STUDENT", password: "student1234" },
];

const AVATARS: Record<string, object> = {
  "sam@ejsuccess.test": { bg: "ocean", skin: "s3", hair: "curly", hairColor: "black", eyes: "open", mouth: "smile", accessory: "none" },
  "lea@ejsuccess.test": { bg: "mint", skin: "s1", hair: "bun", hairColor: "auburn", eyes: "happy", mouth: "grin", accessory: "none" },
  "noah@ejsuccess.test": { bg: "sunset", skin: "s5", hair: "afro", hairColor: "black", eyes: "open", mouth: "grin", accessory: "glasses" },
  "teacher@ejsuccess.test": { bg: "galaxy", skin: "s4", hair: "short", hairColor: "grey", eyes: "happy", mouth: "smile", accessory: "glasses" },
};

async function main() {
  const users: Record<string, string> = {};
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const row = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
        avatar: AVATARS[u.email] ? JSON.stringify(AVATARS[u.email]) : null,
      },
    });
    users[u.email] = row.id;
  }

  // Timetables drive the pet: BIO-101 meets Mon/Wed/Fri/Sun, HIS-201 Tue/Thu.
  const course = await db.course.upsert({
    where: { code: "BIO-101" },
    update: { classDays: "1,3,5,7" },
    create: {
      classDays: "1,3,5,7",
      code: "BIO-101",
      title: "Introduction to Biology",
      description: "Cells, energy and the basics of life.",
      teacherId: users["teacher@ejsuccess.test"],
    },
  });
  await db.course.upsert({
    where: { code: "HIS-201" },
    update: { classDays: "2,4" },
    create: { code: "HIS-201", title: "Histoire contemporaine", description: "De 1789 à nos jours.", classDays: "2,4" },
  });

  // Sam is in BIO-101; Lea isn't assigned to anything yet, so the admin flow can be tried.
  await db.enrollment.upsert({
    where: { userId_courseId: { userId: users["sam@ejsuccess.test"], courseId: course.id } },
    update: {},
    create: { userId: users["sam@ejsuccess.test"], courseId: course.id },
  });

  // Noah is a classmate with some XP this week, so the leaderboard has someone to chase.
  const noah = users["noah@ejsuccess.test"];
  await db.enrollment.upsert({
    where: { userId_courseId: { userId: noah, courseId: course.id } },
    update: {},
    create: { userId: noah, courseId: course.id },
  });
  if ((await db.xpEvent.count({ where: { userId: noah } })) === 0) {
    await db.user.update({ where: { id: noah }, data: { xp: 260, currentStreak: 2, longestStreak: 4 } });
    await db.xpEvent.create({ data: { userId: noah, courseId: course.id, amount: 65, reason: "seed" } });
  }

  // Class 6e A groups Sam and Noah and takes both courses. Lea has no class yet,
  // so assigning her can be tried from Admin → Classes.
  const history = await db.course.findUniqueOrThrow({ where: { code: "HIS-201" } });
  const sixA = await db.schoolClass.upsert({
    where: { name: "6e A" },
    update: {},
    create: { name: "6e A", level: "6e", schoolYear: "2026-2027" },
  });
  for (const c of [course.id, history.id]) {
    await db.classCourse.upsert({
      where: { classId_courseId: { classId: sixA.id, courseId: c } },
      update: {},
      create: { classId: sixA.id, courseId: c },
    });
  }
  for (const email of ["sam@ejsuccess.test", "noah@ejsuccess.test"]) {
    const userId = users[email];
    await db.user.update({ where: { id: userId }, data: { classId: sixA.id } });
    // Same rule as src/lib/classes.ts: derived enrollments never replace a direct one.
    for (const c of [course.id, history.id]) {
      const has = await db.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: c } } });
      if (!has) await db.enrollment.create({ data: { userId, courseId: c, viaClassId: sixA.id } });
    }
  }

  const questions = [
      {
        prompt: "Which organelle produces most of a cell's ATP?",
        choices: ["Nucleus", "Mitochondrion", "Ribosome", "Golgi apparatus"],
        correct: 1,
        explanation: "Mitochondria run cellular respiration, which makes most of the cell's ATP.",
      },
      {
        prompt: "What do plants mainly use to capture light energy?",
        choices: ["Chlorophyll", "Keratin", "Hemoglobin", "Cellulose"],
        correct: 0,
        explanation: "Chlorophyll in the chloroplasts absorbs light for photosynthesis.",
      },
      {
        prompt: "Which molecule carries genetic information?",
        choices: ["ATP", "Glucose", "DNA", "Lipids"],
        correct: 2,
        explanation: "DNA stores the genetic instructions of an organism.",
      },
    {
      prompt: "Where is DNA stored in an animal cell?",
      choices: ["In the nucleus", "In the cell wall", "In the vacuole", "Outside the cell"],
      correct: 0,
      explanation: "Animal cells keep their DNA in the nucleus (plus a little in the mitochondria).",
    },
    {
      prompt: "What gas do plants release during photosynthesis?",
      choices: ["Carbon dioxide", "Nitrogen", "Oxygen", "Helium"],
      correct: 2,
      explanation: "Photosynthesis splits water and releases oxygen.",
    },
  ];
  const questionData = {
    create: questions.map((q, i) => ({
      order: i,
      prompt: q.prompt,
      explanation: q.explanation,
      choices: { create: q.choices.map((text, j) => ({ order: j, text, isCorrect: j === q.correct })) },
    })),
  };

  // One published demo quiz per game mode, so every game can be tried right away.
  const demos = [
    { title: "Cells & energy warm-up", mode: "timed", description: "A sample quiz so you can try the player." },
    { title: "Cellules · Survie", mode: "classic", description: "Trois vies pour finir le quiz." },
    { title: "Cellules · Combo", mode: "timed", description: "Enchaînez les bonnes réponses pour multiplier vos points." },
    { title: "Cellules · Vrai ou faux", mode: "truefalse", description: "Juste ou pas ?" },
    { title: "Cellules · Blitz", mode: "blitz", description: "Un seul chrono pour tout le quiz." },
  ];
  for (const d of demos) {
    const found = await db.quiz.findFirst({ where: { courseId: course.id, title: d.title } });
    if (found) continue;
    await db.quiz.create({
      data: { courseId: course.id, ...d, secondsPerQuestion: 20, published: true, questions: questionData },
    });
  }

  // Quiz options on the demos: varied difficulty, shuffling, and a text for wrong answers.
  type DemoOptions = { difficulty: string; shuffleQuestions: boolean; shuffleAnswers: boolean; combo?: boolean; lives?: number | null; mode?: string };
  const options: Record<string, DemoOptions> = {
    "Cells & energy warm-up": { difficulty: "easy", shuffleQuestions: false, shuffleAnswers: false },
    // Survival and combo are options, combinable with any mode.
    "Cellules · Survie": { mode: "classic", lives: 3, difficulty: "hard", shuffleQuestions: true, shuffleAnswers: true },
    "Cellules · Combo": { mode: "timed", combo: true, difficulty: "medium", shuffleQuestions: true, shuffleAnswers: true },
    "Cellules · Vrai ou faux": { difficulty: "easy", shuffleQuestions: true, shuffleAnswers: false },
    "Cellules · Blitz": { difficulty: "hard", combo: true, shuffleQuestions: true, shuffleAnswers: true },
  };
  // Quizzes saved when survival and combo were still game modes.
  await db.quiz.updateMany({ where: { mode: "survival" }, data: { mode: "classic", lives: 3 } });
  await db.quiz.updateMany({ where: { mode: "combo" }, data: { mode: "timed", combo: true } });
  for (const [title, data] of Object.entries(options)) {
    await db.quiz.updateMany({ where: { courseId: course.id, title }, data });
  }
  const wrongFeedback: Record<string, string> = {
    "Which organelle produces most of a cell's ATP?": "Le noyau contient l’ADN mais ne produit pas d’énergie : c’est le rôle des mitochondries (respiration cellulaire).",
    "What do plants mainly use to capture light energy?": "La cellulose sert à la structure de la paroi ; c’est la chlorophylle, dans les chloroplastes, qui capte la lumière.",
    "Which molecule carries genetic information?": "L’ATP transporte de l’énergie, pas de l’information : relisez la partie sur l’ADN et les gènes.",
    "Where is DNA stored in an animal cell?": "Les cellules animales n’ont pas de paroi : leur ADN est rangé dans le noyau.",
    "What gas do plants release during photosynthesis?": "Le CO₂ est absorbé, pas rejeté : la photosynthèse libère de l’oxygène.",
  };
  for (const [prompt, text] of Object.entries(wrongFeedback)) {
    await db.question.updateMany({ where: { prompt, wrongFeedback: null }, data: { wrongFeedback: text } });
  }

  console.log("Seeded. Accounts:", USERS.map((u) => `${u.email} (${u.role})`).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
