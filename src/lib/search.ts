// Accent- and case-insensitive matching, so "theatre" finds "Théâtre" and "6E A" finds "6e A".
export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** True when every word of the query appears somewhere in the haystack. */
export function matches(query: string, ...haystack: (string | null | undefined)[]) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = normalize(haystack.filter(Boolean).join(" "));
  return words.every((w) => text.includes(w));
}
