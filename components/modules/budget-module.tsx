import { cn } from "@/lib/utils"
import { MoneyDisplay } from "@/components/betting/money-display"

export type BudgetModuleProps = {
  wagered?: number
  entryFee?: number
  /** Short per-phase pick-count line, e.g. "Phase 1: 6 picks · Phase 2: 2
   * picks". Counts only — rule spans belong to the rules card, and
   * shortfalls to the compliance banner. */
  picksLine?: string
  /** Fully balanced per §8.1 (exact total + the pick minimum met) — turns the
   * bar green. Defaults to wagered === entryFee. */
  balanced?: boolean
  compact?: boolean
  className?: string
}

/**
 * "Wagered $X of $Y" budget module with a progress bar and a per-phase
 * pick-count line. Turns amber when over-committed, green when balanced.
 */
export function BudgetModule({
  wagered = 0,
  entryFee = 40,
  picksLine,
  balanced,
  compact = false,
  className,
}: BudgetModuleProps) {
  const pct = Math.min(100, entryFee ? (wagered / entryFee) * 100 : 0)
  const over = wagered > entryFee
  const exact = balanced ?? wagered === entryFee
  const remaining = entryFee - wagered

  const barColor = over ? "bg-caution" : exact ? "bg-win" : "bg-primary"

  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-text-body">Wagered</span>
        <span data-testid="budget-summary" className="text-sm text-text-muted">
          {/* Testid on the running total alone: it's the number /my-bets is
              read for, and "$1" is a substring of "$10 of $40" — a text filter
              over the whole line can pass on the wrong wager (e2e/placement). */}
          <span data-testid="budget-wagered">
            <MoneyDisplay value={wagered} size="sm" weight="semibold" />
          </span>{" "}
          of <MoneyDisplay value={entryFee} size="sm" weight="semibold" />
        </span>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full border border-border bg-surface-sunken">
        <div
          // Width, not scaleX — the one place the transform-only rule is
          // deliberately broken (design system § Motion). This is a 10px solid
          // block with a pill cap and no children: scaleX would squash the
          // radius, and the layout cost of animating it is nil.
          className={cn(
            "h-full rounded-full transition-[width] duration-slow ease-out",
            barColor
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!compact && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-text-muted">{picksLine}</span>
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
