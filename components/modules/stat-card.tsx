import { cn } from "@/lib/utils"
import { MoneyDisplay } from "@/components/betting/money-display"

export type StatCardProps = {
  label: string
  value: number | string
  /** Render the value as money (uses MoneyDisplay). */
  money?: boolean
  cents?: boolean
  caption?: string
  /** Give the pool-total tile the indigo clubhouse treatment. */
  feature?: boolean
  className?: string
}

/**
 * Dashboard stat tile — a glanceable label + big number. `feature` gives the
 * marquee tile (e.g. pool total) the dark indigo treatment with gold label.
 */
export function StatCard({
  label,
  value,
  money = false,
  cents = false,
  caption,
  feature = false,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border p-4",
        feature
          ? "border-transparent bg-surface-inverse shadow-md"
          : "border-border bg-surface-card shadow-sm",
        className
      )}
    >
      <span
        className={cn(
          "text-[11px] font-bold tracking-wider uppercase",
          feature ? "text-gold-300" : "text-text-muted"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular text-3xl leading-none font-bold",
          feature ? "text-white" : "text-text-strong"
        )}
      >
        {money && typeof value === "number" ? (
          <MoneyDisplay
            value={value}
            cents={cents}
            size="xl"
            className="text-inherit"
          />
        ) : (
          value
        )}
      </span>
      {caption && (
        <span
          className={cn(
            "text-sm",
            feature ? "text-indigo-200" : "text-text-muted"
          )}
        >
          {caption}
        </span>
      )}
    </div>
  )
}
