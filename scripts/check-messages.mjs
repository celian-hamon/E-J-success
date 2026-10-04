// Checks that every locale has exactly the same keys as messages/fr.json.
// Run: node scripts/check-messages.mjs
import { readdir, readFile } from "node:fs/promises";

const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

const reference = new Set(flat(JSON.parse(await readFile("messages/fr.json", "utf8"))));
let ok = true;
for (const file of (await readdir("messages")).filter((f) => f.endsWith(".json") && f !== "fr.json")) {
  const keys = new Set(flat(JSON.parse(await readFile(`messages/${file}`, "utf8"))));
  const missing = [...reference].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !reference.has(k));
  if (missing.length || extra.length) ok = false;
  console.log(`${file}: ${missing.length} missing, ${extra.length} extra`);
  missing.forEach((k) => console.log(`  - missing ${k}`));
  extra.forEach((k) => console.log(`  + extra ${k}`));
}
// In ICU messages a straight apostrophe escapes what follows: "l'<tint>" or "l'{name}"
// would print the tag or placeholder literally. Use the typographic ’ instead.
const values = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? values(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));
for (const file of (await readdir("messages")).filter((f) => f.endsWith(".json"))) {
  for (const [key, value] of values(JSON.parse(await readFile(`messages/${file}`, "utf8")))) {
    if (/'[<{}#|]/.test(value)) {
      ok = false;
      console.log(`${file}: ${key} has a straight apostrophe before a tag or placeholder; use ’`);
    }
  }
}
process.exit(ok ? 0 : 1);
