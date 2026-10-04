// A quiz has one game mode (how questions are asked and timed) plus options that can be
// combined with any mode: combo (streaks multiply points) and survival (limited lives).
// All modes use the same multiple-choice questions, so any quiz can be played in any mode.
//
// To add a mode: describe it here, add its label and description under "gameModes"
// in messages/*.json, and handle any new mechanic in QuizPlayer and gradeAnswer.
export type GameModeConfig = {
  timer: "none" | "question" | "global"; // per-question countdown, or one clock for the whole game
  trueFalse?: boolean; // one proposed answer per question: true or false?
};

export const GAME_MODES = {
  classic: { timer: "none" },
  timed: { timer: "question" },
  truefalse: { timer: "none", trueFalse: true },
  blitz: { timer: "global" },
} as const satisfies Record<string, GameModeConfig>;

export type GameMode = keyof typeof GAME_MODES;
export const GAME_MODE_KEYS = Object.keys(GAME_MODES) as GameMode[];

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === "string" && value in GAME_MODES;
}

/** The rules a game runs with: its mode plus the quiz's options. */
export type PlayConfig = GameModeConfig & {
  combo: boolean; // consecutive correct answers multiply the points
  lives: number | null; // survival: the game ends after this many wrong answers
};

export function playConfig(quiz: { mode: string; combo: boolean; lives: number | null }): PlayConfig {
  const mode: GameModeConfig = isGameMode(quiz.mode) ? GAME_MODES[quiz.mode] : GAME_MODES.classic;
  return { ...mode, combo: quiz.combo, lives: quiz.lives && quiz.lives > 0 ? quiz.lives : null };
}

export const MAX_COMBO = 5;
export const MAX_LIVES = 10;

/** Blitz: one clock for the whole quiz, half the usual time per question (at least 30 s). */
export function blitzSeconds(questionCount: number, secondsPerQuestion: number) {
  return Math.max(30, Math.round(questionCount * secondsPerQuestion * 0.5));
}

export function comboMultiplier(streakBefore: number) {
  return Math.min(MAX_COMBO, 1 + streakBefore);
}

/**
 * Points for one answer: the mode's base points, multiplied by the combo when that option
 * is on. `streakBefore` is the number of correct answers in a row just before this one.
 */
export function scoreAnswer(cfg: PlayConfig, correct: boolean, timeMs: number, limitMs: number, streakBefore = 0) {
  if (!correct) return 0;
  const base = cfg.timer === "question" ? 500 + Math.round(500 * Math.max(0, 1 - timeMs / limitMs)) : 100;
  return cfg.combo ? base * comboMultiplier(streakBefore) : base;
}

/** Quiz options from a form (editor or PDF upload): combo, survival lives and shuffling. */
export function quizOptions(formData: FormData) {
  const survival = formData.get("survival") === "on";
  const lives = Math.min(MAX_LIVES, Math.max(1, Math.round(Number(formData.get("lives")) || 3)));
  return {
    combo: formData.get("combo") === "on",
    lives: survival ? lives : null,
    shuffleQuestions: formData.get("shuffleQuestions") === "on",
    shuffleAnswers: formData.get("shuffleAnswers") === "on",
  };
}

/** Badge colour class used on quiz tiles. */
export const MODE_BADGE: Record<GameMode, string> = {
  classic: "badge-teal",
  timed: "badge-rose",
  truefalse: "badge-teal",
  blitz: "badge-violet",
};
