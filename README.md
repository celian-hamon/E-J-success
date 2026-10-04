# E-J Success

Quiz games built from course PDFs. Admins assign students to courses, teachers turn a PDF into a quiz
for a course, and students play only the quizzes in the courses they're assigned to.

The look is based on the "Aurora Glass" design: frosted-glass panels over an animated aurora sky.

## Stack

- **Next.js 16** (App Router, server actions, TypeScript)
- **next-intl**: French by default, English included; the language comes from the user's choice, then the browser
- **PWA**: installable, works offline, and resyncs games played offline (`public/sw.js`)
- **Prisma 6** with SQLite locally (switch `provider` to `postgresql` for production)
- Cookie sessions signed with `jose`, passwords hashed with `bcryptjs`
- **Claude** (`@anthropic-ai/sdk`, `claude-opus-5-5`) reads the uploaded PDF and writes the questions

## Getting started

```bash
npm install
cp .env.example .env        # then set AUTH_SECRET (and ANTHROPIC_API_KEY to enable generation)
npm run db:push             # create the database
npm run db:seed             # demo accounts, two courses, one sample quiz
npm run dev
```

The demo accounts and their passwords are listed in `prisma/seed.ts`.
`npm run db:reset` wipes the database and re-seeds it.

The service worker only runs in production builds (`npm run build && npm run start`).
To try it with `npm run dev`, set `NEXT_PUBLIC_SW_DEV=1`.

> **Windows note:** if the build fails with "Failed to load native binding … DACL grants replacement
> rights", SWC refuses a cache folder that other accounts can write to. Point
> `SWC_NATIVE_BINDING_CACHE` at a folder only you can write to, for example
> `%USERPROFILE%\.ejs-swc-cache` with inheritance removed (`icacls <dir> /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"`).

## Classes (`src/lib/classes.ts`)

A **class** (6e A, Terminale B…) groups students and the courses they take together:

- Admin → **Classes**: create a class, add its courses, add its students (tick boxes or paste emails).
- Each student belongs to **at most one class**. Adding them to another class moves them.
- Every student in a class automatically has access to all of the class's courses. Under the hood these are enrollments marked `viaClassId`, kept in sync on every change, so the access rules, pet, leaderboards and offline cache need no special case.
- Individual enrollments (options, extra courses) are still done from the course page. They're never removed by a class change, and the course page marks which students come "via" a class.
- Deleting a class keeps its students (with no class) and removes only the access it granted.

## Languages (i18n)

- Translations live in `messages/fr.json` (the reference) and `messages/en.json`.
- Every key is type-checked against `fr.json` (`src/i18n/global.d.ts`), so a typo fails the build.
- `node scripts/check-messages.mjs` checks that every language has exactly the same keys.
- **Add a language:** add its code to `LOCALES` in `src/i18n/config.ts`, copy `fr.json` to `<code>.json` and translate it.
- Dates, numbers and weekday names are formatted for the user's language. The time zone is set in `src/i18n/config.ts` (Europe/Paris).
- The URLs have no locale prefix: the choice is stored in the `NEXT_LOCALE` cookie (selector in the footer).

## Offline (PWA)

| What | How |
|---|---|
| Install | Web manifest (`src/app/manifest.ts`), icons in `public/icons` (regenerate with `node scripts/make-icons.mjs`) |
| JS/CSS/fonts | Cache-first: file names are content-hashed |
| Pages | Network-first with a 3.5 s timeout, then the cache, then `/offline` |
| Pre-caching | After sign-in, `/api/offline/urls` lists every page the user can open (their courses, each quiz, their pet, recent results). The service worker caches them along with their JS and CSS |
| Privacy | Cached pages are cleared when the user or the language changes on the device |
| Offline play | If the connection drops, the player keeps answers on the device (IndexedDB, `src/lib/offline/outbox.ts`) |
| Resync | When the connection returns (the `online` event, Background Sync on Chromium, or the next visit), runs are sent to `/api/sync/attempts`. There they're graded on the server, deduplicated by `clientId`, credited to the day they were played (streak, pet meal), and the toast links to the result |

Answers are still never graded in the browser: when offline, the student sees "answer saved" and gets
the correction after the sync.

## Tamagotchi (`src/lib/pet/`)

Each student has a pet that feeds on their **daily classes**:

- Each course has class days (admin → course → "Jours de cours").
- On a class day, every course that meets (and has a published quiz) owes the pet one meal.
- **Finishing any quiz from that course that day earns its meal.** The student then feeds the pet with one click.
- A meal earned but not given is eaten overnight, since the learning is what counts.
- Each meal missed costs 25 fullness and 15 happiness. Days with no class are rest days.
- The pet never dies: it gets weak and recovers once it's fed again.
- It grows with meals eaten (egg → baby → child → teen → adult). Its name and colour can be changed, and it accepts one cuddle a day.

Missed days are computed lazily on each visit (`syncPet`), so there's no cron job to run.

## Roles

| Role    | Home       | Can do |
|---------|------------|--------|
| Admin   | `/admin`   | Create accounts and courses, assign a teacher to each course, assign students to courses (pick from a list or paste emails), and everything a teacher can do |
| Teacher | `/teacher` | For courses they teach: upload a PDF to generate a quiz, edit questions, choose the game mode, publish, and see results |
| Student | `/student` | See their assigned courses, play the published quizzes, and review their answers with explanations |

## How a quiz is made

1. A teacher opens a course and uploads a PDF (`POST /api/courses/[courseId]/quizzes`).
2. If `ANTHROPIC_API_KEY` is set, the PDF goes to Claude, which returns structured JSON:
   questions, 4 choices each, the correct index, and an explanation (`src/lib/quiz-generator.ts`).
   Without a key, the upload creates an empty draft that the teacher fills in by hand.
3. The quiz starts as a **draft**. The teacher reviews or edits it, then publishes it to the course.

The source PDF is saved to `./uploads` (see `src/lib/uploads.ts`). On serverless hosting, swap that
for object storage such as S3, R2 or Vercel Blob.

## Game modes

Defined in `src/lib/game-modes.ts`. They all use the same multiple-choice questions, so any quiz can be played in any mode:

| Mode | Rules |
|---|---|
| **Classique** | No timer, 100 points per correct answer |
| **Contre la montre** | A countdown per question; 500–1000 points depending on speed |
| **Vrai ou faux** | One proposed answer per question (correct half the time, picked by the server); the student says true or false |
| **Blitz** | One clock for the whole game (half the usual time per question); play until it runs out |

**Options that combine with every mode** (quiz editor and PDF upload):

| Option | Effect |
|---|---|
| **Combo** | Consecutive correct answers multiply the mode's points (×2, ×3… up to ×5); a mistake resets the streak |
| **Survie** | N lives (1–10); each mistake costs one, and the game ends when none are left |

Lives, combo order, true/false and the blitz clock are all checked on the server (`src/lib/grading.ts`),
including for runs played offline and synced later. The browser never receives the correct answers in advance.

## Quiz options

Set at upload time or in the quiz editor:

- **Shuffle questions / answers**: a new order on every visit, done on the server (grading uses ids, not positions).
- **Difficulty** (`src/lib/difficulty.ts`): easy ×1, medium ×1.5, hard ×2 on the quiz's XP (shown as "Bonus difficulté" on the results). When generating from a PDF, Claude adapts the questions to it.
- **Wrong-answer text** (per question): shown only after a wrong answer or a timeout, in addition to the general explanation. Claude writes it at generation time.

## School leaderboard (`/leaderboard`)

Open to everyone, and covers all classes and courses: week, month or all time.

- **Students**: podium plus ranking, with each student's class. A student sees the top of the board and the people around them; students who opted out are hidden.
- **Classes**: ranked by **average XP per student** (so small and large classes compete fairly), with the total shown.

## Courses and search (admin)

- `/admin/courses`: instant search (accents and case ignored) across code, title, teacher and classes; filters by teacher, class, day; sorting. The filters live in the URL, so they can be bookmarked.
- Bulk actions: tick courses, then **add to a class**, **remove from a class**, or **assign a teacher**.
- Course page: tick the **classes** that take it, and **duplicate** the course (copies its timetable and quizzes as drafts, handy for a new school year).
- Class page: searchable pickers for students and courses, plus **create a course right in the class**.

## Meta progression

All of it lives in `src/lib/gamification/`. The design follows the research on what works in
educational gamification: levels and progress bars help most, while plain points, badges and
leaderboards backfire when they reward grinding or put low performers on public display.

| Feature | How it works | Why it's designed this way |
|---|---|---|
| **XP and levels** (`levels.ts`) | Each level takes 50 XP more than the last. Tier titles run Rookie, Explorer, Scholar, Expert, Sage, Legend | Steady, visible progress builds a sense of competence |
| **Mastery-based XP** (`engine.ts`) | The first run pays for every correct answer. Replays only pay for beating your best (or +5 practice XP) | Students replay to master the material, not to farm points |
| **Mastery stars** | 1★ at 50%, 2★ at 80%, 3★ at 100%, shown on each quiz tile | A clear "replay to improve" goal for each quiz |
| **Forgiving streaks** (`streak.ts`) | A daily streak plus a daily bonus. Every 7 days earns a streak freeze (max 2), and a freeze covers one missed day | Keeps the habit loop without guilt or punishment |
| **Badges** (`badges.ts`) | 12 badges for mastery, improvement, consistency and exploration | Rewards learning behaviours rather than raw volume |
| **Avatar** (`avatar.ts`, `components/Avatar.tsx`) | A layered SVG profile picture, shown everywhere with a ring coloured by level tier. Identity options are always free; cosmetics unlock by level or badge | Gives students choice and something to show off. It never gates identity |
| **Leaderboards** (`leaderboard.ts`) | Weekly and per course. Students see the top 3 plus their own neighbours ("12 XP to pass Ana") and can hide themselves | A fresh start each week, a nearby target to chase, and no shaming at the bottom |

To add a badge, add it to `badges.ts` and add a `grant(...)` line in `engine.ts`. To add an avatar
item, add an option in `avatar.ts` and draw it in `components/Avatar.tsx`.

## Project layout

```
prisma/schema.prisma        User, Course, Enrollment, Quiz, Question, Choice, Attempt, AttemptAnswer
src/lib/                    auth, db, roles, game modes, Claude generator, uploads
src/lib/gamification/       XP/levels, streaks, badges, avatar catalog, leaderboards, reward engine
src/app/profile/            avatar editor, badges, leaderboard privacy
src/app/admin/              courses, users, enrollments
src/app/teacher/            course quizzes, PDF upload form, quiz editor
src/app/student/            course list, quiz player
src/app/attempts/[id]/      results review (student, or the course's teacher)
src/components/             aurora sky canvas, nav, shared UI
```
