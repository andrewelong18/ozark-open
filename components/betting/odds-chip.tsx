import { cn } from "@/lib/utils"
import { toFractional, toImpliedProbability } from "@/lib/odds"

type OddsSize = "sm" | "md" | "lg"

const chipSize: Record<OddsSize, string> = {
  sm: "h-6 min-w-9 text-sm",
  md: "h-[30px] min-w-[42px] text-base",
  lg: "h-9 min-w-12 text-lg",
}

export type OddsChipProps = {
  /** American odds — positive or negative. */
  odds: number
  size?: OddsSize
  /** Reveal fractional + implied probability alongside the chip. */
  detail?: boolean
  className?: string
}

/**
 * The primary betting token: American odds (+150 / −130). Positive reads
 * fairway-green, negative reads ink. `detail` reveals fractional + implied.
 */
export function OddsChip({
  odds,
  size = "md",
  detail = false,
  className,
}: OddsChipProps) {
  const positive = odds > 0
  const label = positive ? `+${odds}` : `${odds}`

  const chip = (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border px-2.5 font-bold leading-none tracking-[0.01em] tabular",
        chipSize[size],
        positive
          ? "border-win-border bg-odds-positive-surface text-odds-positive"
          : "border-border bg-odds-negative-surface text-odds-negative"
      )}
    >
      {label}
    </span>
  )

  if (!detail) return <span className={className}>{chip}</span>

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {chip}
      <span className="tabular inline-flex flex-col text-[11px] leading-[1.2] text-text-muted">
        <span>{toFractional(odds)}</span>
        <span>{toImpliedProbability(odds)}</span>
      </span>
    </span>
  )
}
