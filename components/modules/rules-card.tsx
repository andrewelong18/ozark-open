import { cn } from "@/lib/utils"
import { MoneyDisplay } from "@/components/betting/money-display"

export type RulesCardProps = {
  entryFee?: number
  maxSingle?: number
  maxSelf?: number
  minBets?: number
  maxBets?: number
  className?: string
}

/**
 * Personalized "house rules" reference card — entry fee, max single/self bet,
 * bet counts. Reference-card energy (clean rows), not legal-terms energy.
 */
export function RulesCard({
  entryFee = 40,
  maxSingle = 20,
  maxSelf = 10,
  minBets = 5,
  maxBets = 10,
  className,
}: RulesCardProps) {
  const rows: { label: string; node: React.ReactNode }[] = [
    {
      label: "Entry fee",
      node: <MoneyDisplay value={entryFee} size="sm" weight="semibold" />,
    },
    {
      label: "Max single bet",
      node: <MoneyDisplay value={maxSingle} size="sm" weight="semibold" />,
    },
    {
      label: "Max bet on yourself",
      node: <MoneyDisplay value={maxSelf} size="sm" weight="semibold" />,
    },
    { label: "Bets per round", node: `${minBets}–${maxBets}` },
    {
      label: "Total must equal",
      node: <MoneyDisplay value={entryFee} size="sm" weight="semibold" />,
    },
  ]

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-surface-card shadow-sm",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-4 py-3">
        <span aria-hidden className="text-[15px]">
          ⛳
        </span>
        <span className="font-heading text-lg text-indigo-800">
          Your House Rules
        </span>
      </div>
      <div>
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={cn(
              "flex items-center justify-between px-4 py-2.5",
              i > 0 && "border-t border-border"
            )}
          >
            <span className="text-sm text-text-muted">{r.label}</span>
            <span className="tabular text-sm font-semibold text-text-strong">
              {r.node}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
