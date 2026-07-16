function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

export function toFractional(americanOdds: number): string {
  if (americanOdds > 0) {
    const g = gcd(americanOdds, 100)
    return `${americanOdds / g}-${100 / g}`
  } else {
    const abs = Math.abs(americanOdds)
    const g = gcd(100, abs)
    return `${100 / g}-${abs / g}`
  }
}

export function toImpliedProbability(americanOdds: number): string {
  let prob: number
  if (americanOdds > 0) {
    prob = 100 / (americanOdds + 100)
  } else {
    const abs = Math.abs(americanOdds)
    prob = abs / (abs + 100)
  }
  return `${(prob * 100).toFixed(1)}%`
}
