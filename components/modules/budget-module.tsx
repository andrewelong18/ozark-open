import { cn } from "@/lib/utils"
import { MoneyDisplay } from "@/components/betting/money-display"

export type BudgetModuleProps = {
  wagered?: number
  entryFee?: number
  betCount?: number
  minBets?: number
  maxBets?: number
  compact?: boolean
  className?: string
}

/**
 * "Wagered $X of $Y" budget module with a progress bar and a min/max-bets
 * indicator. Turns amber when over-committed, green when exactly balanced.
 */
export function BudgetModule({
  wagered = 0,
  entryFee = 40,
  betCount = 0,
  minBets = 5,
  maxBets = 10,
  compact = false,
  className,
}: BudgetModuleProps) {
  const pct = Math.min(100, entryFee ? (wagered / entryFee) * 100 : 0)
  const over = wagered > entryFee
  const exact = wagered === entryFee && betCount >= minBets
  const remaining = entryFee - wagered

  const barColor = over ? "bg-caution" : exact ? "bg-win" : "bg-primary"

  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-text-body">Wagered</span>
        <span className="text-sm text-text-muted">
          <MoneyDisplay value={wagered} size="sm" weight="semibold" /> of{" "}
          <MoneyDisplay value={entryFee} size="sm" weight="semibold" />
        </span>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full border border-border bg-surface-sunken">
        <div
          className={cn("h-full rounded-full transition-[width]", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!compact && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-text-muted">
            {betCount}/{minBets} min bets · {maxBets} max
          </span>
          <span
            className={cn(
              "text-xs font-semibold",
              over
                ? "text-caution-strong"
                : exact
                  ? "text-win-strong"
                  : "text-text-muted"
            )}
          >
            {over ? (
              <>
                Over by{" "}
                <MoneyDisplay
                  value={-remaining}
                  size="xs"
                  weight="semibold"
                  className="text-inherit"
                />
              </>
            ) : exact ? (
              "Balanced ✓"
            ) : (
              <>
                <MoneyDisplay
                  value={remaining}
                  size="xs"
                  weight="semibold"
                  className="text-inherit"
                />{" "}
                left
              </>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
