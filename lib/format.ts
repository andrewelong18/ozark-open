// Probabilities arrive from the admin's sheet as decimals (0.4761…) and are
// shown to one decimal place ("47.6%") per PRD §6 — never recomputed from
// the odds. Applies to both a pick's probability and a bet's total.
export function formatProbability(decimal: number): string {
  return `${(decimal * 100).toFixed(1)}%`
}
