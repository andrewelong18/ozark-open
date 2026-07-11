import { cn } from "@/lib/utils"
import { OddsChip } from "./odds-chip"
import { StatusBadge, type BetStatus } from "./status-badge"
import { OutcomeBadge, type Outcome } from "./outcome-badge"
import { StakeInput } from "./stake-input"
import { MoneyDisplay } from "./money-display"

export type BetRowProps = {
  number: number
  description: string
  odds: number
  status?: BetStatus
  outcome?: Outcome | null
  oddsDetail?: boolean
  /** Wired stake value; presence of onPlace turns on the inline StakeInput. */
  stake?: string
  placed?: boolean
  stakeError?: string | null
  onStakeChange?: (digits: string) => void
  onPlace?: () => void
  className?: string
}

/**
 * The workhorse bet row. Mobile-first: number + description on top, the
 * odds/status cluster beneath, and a right-hand action zone that adapts to
 * status — StakeInput when open + interactive, the placed amount when placed,
 * an outcome badge when resolved, quiet otherwise.
 */
export function BetRow({
  number,
  description,
  odds,
  status = "open",
  outcome = null,
  oddsDetail = true,
  stake = "",
  placed = false,
  stakeError = null,
  onStakeChange,
  onPlace,
  className,
}: BetRowProps) {
  const isOpen = status === "open"
  const dimmed = status === "closed" && !placed
  const interactive = isOpen && !!onPlace

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 transition-colors",
        placed ? "bg-indigo-50" : "bg-surface-card",
        dimmed && "opacity-70",
        className
      )}
    >
      {/* Left: number + description + odds cluster */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="tabular min-w-5 text-xs font-bold text-text-muted">
            #{number}
          </span>
          <span className="text-base leading-snug font-medium text-pretty text-text-strong">
            {description}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 pl-7">
          <OddsChip odds={odds} detail={oddsDetail} size="sm" />
          {status !== "open" && <StatusBadge status={status} />}
        </div>
      </div>

      {/* Right: action zone */}
      <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
        {outcome ? (
          <OutcomeBadge outcome={outcome} />
        ) : interactive ? (
          <StakeInput
            value={stake}
            placed={placed}
            error={stakeError}
            onChange={onStakeChange}
            onPlace={onPlace}
          />
        ) : placed ? (
          <div className="text-right">
            <div className="text-[11px] font-semibold tracking-wide text-text-muted uppercase">
              Placed
            </div>
            <MoneyDisplay value={Number(stake) || 0} size="md" />
          </div>
        ) : (
          <StatusBadge status={status} />
        )}
      </div>
    </div>
  )
}
