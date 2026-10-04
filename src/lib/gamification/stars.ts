/** Mastery stars for one quiz, from the best run: 50% → 1, 80% → 2, 100% → 3. */
export function starsFor(correct: number, total: number) {
  if (total === 0) return 0;
  const pct = correct / total;
  if (pct >= 1) return 3;
  if (pct >= 0.8) return 2;
  if (pct >= 0.5) return 1;
  return 0;
}
