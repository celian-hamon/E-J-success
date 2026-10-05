// Question types. Every type is played in any game mode (timers, combo, survival work the same).
//   choice      multiple choice, one correct Choice (the original type)
//   hotspot     click the right zone of the question image; zones in `data`
//   order       put the Choice rows back in order (Choice.order is the right position)
//   categorize  sort the Choice rows into categories (Choice.group indexes data.categories)
//   numeric     type a number; data.answer ± data.tolerance, with an optional unit
// Shared by the server (grading) and the browser (player, editor), so no server-only imports.

export const QUESTION_TYPES = ["choice", "hotspot", "order", "categorize", "numeric"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === "string" && (QUESTION_TYPES as readonly string[]).includes(value);
}

export function questionType(value: string): QuestionType {
  return isQuestionType(value) ? value : "choice";
}

export const MAX_CHOICES = 6; // multiple choice: answer keys A–F
export const MAX_ITEMS = 8; // order / categorize
export const MAX_CATEGORIES = 4;
export const MAX_ZONES = 6;

/** A rectangle on the question image, in fractions of its width and height (0 to 1). */
export type Zone = { x: number; y: number; w: number; h: number };

export type QuestionData = {
  zones?: Zone[];
  categories?: string[];
  answer?: number;
  tolerance?: number;
  unit?: string | null;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Keeps a zone inside the image; null if it isn't a usable rectangle. */
export function cleanZone(z: unknown): Zone | null {
  if (!z || typeof z !== "object") return null;
  const { x, y, w, h } = z as Record<string, unknown>;
  if (![x, y, w, h].every(finite)) return null;
  const zone = { x: clamp01(x as number), y: clamp01(y as number), w: 0, h: 0 };
  zone.w = Math.min(1 - zone.x, w as number);
  zone.h = Math.min(1 - zone.y, h as number);
  return zone.w > 0.005 && zone.h > 0.005 ? zone : null;
}

export function parseData(raw: string | null | undefined): QuestionData {
  if (!raw) return {};
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    return {
      zones: Array.isArray(d.zones) ? d.zones.map(cleanZone).filter((z): z is Zone => z !== null) : undefined,
      categories: Array.isArray(d.categories) ? d.categories.map(String) : undefined,
      answer: finite(d.answer) ? d.answer : undefined,
      tolerance: finite(d.tolerance) ? Math.abs(d.tolerance) : undefined,
      unit: typeof d.unit === "string" ? d.unit : null,
    };
  } catch {
    return {};
  }
}

/** Reads a typed number the way students write it: "37 674", "0,17", "−1176", "8e-3", "8×10^-3". */
export function parseNumber(input: string): number | null {
  const s = input
    .trim()
    .replace(/[\s  ]/g, "")
    .replace(/[−–]/g, "-")
    .replace(/[×x*]10\^?/i, "e")
    .replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** What the student sends for each type (null = no answer, e.g. time ran out). */
export type HotspotResponse = { x: number; y: number };
export type OrderResponse = string[]; // choice ids, first to last
export type CategorizeResponse = Record<string, number>; // choice id → category index
export type NumericResponse = string; // as typed
export type AnswerResponse = HotspotResponse | OrderResponse | CategorizeResponse | NumericResponse;

/** The right answer, sent back after answering so the player can show it. */
export type Solution =
  | { type: "hotspot"; zones: Zone[] }
  | { type: "order"; order: string[] }
  | { type: "categorize"; groups: Record<string, number> }
  | { type: "numeric"; answer: number; tolerance: number; unit: string | null };

type GradableChoice = { id: string; order: number; group: number | null };

export function solutionFor(type: QuestionType, data: QuestionData, choices: GradableChoice[]): Solution | null {
  switch (type) {
    case "hotspot":
      return { type, zones: data.zones ?? [] };
    case "order":
      return { type, order: [...choices].sort((a, b) => a.order - b.order).map((c) => c.id) };
    case "categorize":
      return { type, groups: Object.fromEntries(choices.map((c) => [c.id, c.group ?? -1])) };
    case "numeric":
      return { type, answer: data.answer ?? NaN, tolerance: data.tolerance ?? 0, unit: data.unit ?? null };
    default:
      return null;
  }
}

export function inZone(p: HotspotResponse, z: Zone) {
  return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
}

export function numericMatches(value: number, answer: number, tolerance: number) {
  // A tiny relative margin so 0.1 + 0.2 style rounding never fails an exact answer.
  return Math.abs(value - answer) <= tolerance + 1e-9 * Math.max(1, Math.abs(answer));
}

/** Whether a response is right. Untrusted input: anything malformed is simply wrong. */
export function isRightResponse(solution: Solution, response: unknown): boolean {
  if (response === null || response === undefined) return false;
  switch (solution.type) {
    case "hotspot": {
      const p = response as Partial<HotspotResponse>;
      if (!finite(p.x) || !finite(p.y)) return false;
      return solution.zones.some((z) => inZone({ x: p.x!, y: p.y! }, z));
    }
    case "order":
      return (
        Array.isArray(response) &&
        response.length === solution.order.length &&
        response.every((id, i) => id === solution.order[i])
      );
    case "categorize": {
      if (typeof response !== "object" || Array.isArray(response)) return false;
      const given = response as Record<string, unknown>;
      return Object.entries(solution.groups).every(([id, g]) => given[id] === g);
    }
    case "numeric": {
      const n = typeof response === "string" ? parseNumber(response) : finite(response) ? response : null;
      return n !== null && numericMatches(n, solution.answer, solution.tolerance);
    }
  }
}

/** Parses a stored AttemptAnswer.response. */
export function parseResponse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
