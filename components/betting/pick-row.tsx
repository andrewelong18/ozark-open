import { cn } from "@/lib/utils"
import { OddsChip } from "./odds-chip"
import { OutcomeBadge, type Outcome } from "./outcome-badge"

export type PickResult = "pending" | Outcome

export type PickRowProps = {
  /** The sheet's pick label, incl. stroke notation: "Steve Jones (-5)", "Field". */
  label: string
  americanOdds: number
  /** Sheet-supplied display strings — rendered verbatim, never recomputed. */
  fractionalOdds: string
  probability: string
  result?: PickResult
  className?: string
}

/**
 * A pick inside a bet card — the thing participants wager on. Display-only
 * for now (placement UI arrives with the placements sprint). The result
 * badge renders only once a non-pending result has been uploaded.
 */
export function PickRow({
  label,
  americanOdds,
  fractionalOdds,
  probability,
  result = "pending",
  className,
}: PickRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border bg-surface-card px-4 py-3 last:border-b-0",
        className
      )}
    >
      <span className="min-w-0 flex-1 text-base leading-snug font-medium text-pretty text-text-strong">
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        {result !== "pending" && <OutcomeBadge outcome={result} size="sm" />}
        <OddsChip
          odds={americanOdds}
          size="sm"
          fractional={fractionalOdds}
          probability={probability}
        />
      </span>
    </div>
  )
}
