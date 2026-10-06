// Who sees each part of a public profile (/users/[id]). Name, avatar and role are always shown.
// The owner and admins always see everything.

export const PROFILE_SECTIONS = ["level", "stats", "badges", "pet", "courses", "activity"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

/** everyone: any signed-in user · class: classmates and teachers of my courses · private: only me */
export const AUDIENCES = ["everyone", "class", "private"] as const;
export type Audience = (typeof AUDIENCES)[number];

export type Privacy = Record<ProfileSection, Audience>;

export const DEFAULT_PRIVACY: Privacy = {
  level: "everyone",
  stats: "class",
  badges: "everyone",
  pet: "class",
  courses: "class",
  activity: "private",
};

/** Sections that mean something for each role (staff don't play, have no pet…). */
export function sectionsFor(role: string): ProfileSection[] {
  return role === "STUDENT" ? [...PROFILE_SECTIONS] : ["courses"];
}

const isAudience = (v: unknown): v is Audience => typeof v === "string" && (AUDIENCES as readonly string[]).includes(v);

export function parsePrivacy(raw: string | null | undefined): Privacy {
  const out = { ...DEFAULT_PRIVACY };
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const s of PROFILE_SECTIONS) if (isAudience(data[s])) out[s] = data[s];
  } catch {
    /* defaults */
  }
  return out;
}

/** How close the viewer is to the profile's owner. */
export type Relation = "self" | "admin" | "class" | "other";

/** Whether a viewer with this relation may see a section set to `audience`. */
export function canSee(relation: Relation, audience: Audience) {
  if (relation === "self" || relation === "admin") return true;
  if (audience === "everyone") return true;
  if (audience === "class") return relation === "class";
  return false;
}
