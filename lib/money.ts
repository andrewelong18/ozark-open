// Money formatting for the sportsbook. Whole dollars for stakes/entries,
// cents for computed payouts. Kept locale-aware (en-US) and separate from the
// sign/color treatment, which lives in the MoneyDisplay component.

export function formatMoneyAmount(value: number, cents = false): string {
  const n = Math.abs(value)
  return cents
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : Math.round(n).toLocaleString("en-US")
}
