import { cn } from "@/lib/utils"

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
  /** Sheet-supplied fractional odds string (e.g. "11/10"), shown verbatim. */
  fractional?: string
  /** Pre-formatted implied probability (e.g. "47.6%"), shown verbatim. */
  probability?: string
  className?: string
}

/**
 * The primary betting token: American odds (+150 / −130). Positive reads
 * fairway-green, negative reads ink. Pass `fractional` / `probability` to
 * reveal the detail column — both are sheet-supplied strings (ADR 0001 §8),
 * never computed here.
 */
export function OddsChip({
  odds,
  size = "md",
  fractional,
  probability,
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

  if (!fractional && !probability) return <span className={className}>{chip}</span>

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {chip}
      <span className="tabular inline-flex flex-col text-[11px] leading-[1.2] text-text-muted">
        {fractional && <span>{fractional}</span>}
        {probability && <span>{probability}</span>}
      </span>
    </span>
  )
}
