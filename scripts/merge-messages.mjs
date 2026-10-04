// Deep-merges a JSON patch of new keys into messages/<locale>.json.
// Usage: node scripts/merge-messages.mjs patch.json   (patch = { "fr": {...}, "en": {...} })
import { readFile, writeFile } from "node:fs/promises";

const patch = JSON.parse(await readFile(process.argv[2], "utf8"));
const merge = (target, source) => {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object") merge((target[k] ??= {}), v);
    else target[k] = v;
  }
};
for (const [locale, keys] of Object.entries(patch)) {
  const file = `messages/${locale}.json`;
  const json = JSON.parse(await readFile(file, "utf8"));
  merge(json, keys);
  await writeFile(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`merged into ${file}`);
}
