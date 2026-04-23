/**
 * Light fuzzy match score. Higher is better, -1 means no match.
 * Returns 0 for empty queries.
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 100 - (t.indexOf(q) || 0);
  let ti = 0;
  let score = 0;
  for (const qc of q) {
    const found = t.indexOf(qc, ti);
    if (found === -1) return -1;
    score += 2;
    ti = found + 1;
  }
  return score;
}
