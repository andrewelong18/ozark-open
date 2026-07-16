import { cn } from "@/lib/utils"

export type EmptyStateProps = {
  glyph?: string
  title: string
  message?: string
  action?: React.ReactNode
  className?: string
}

/**
 * Empty / waiting state — "No bets published yet", "Round 2 opens Saturday".
 * Centered, quiet, with an optional action. A little personality is welcome.
 */
export function EmptyState({
  glyph = "⛳",
  title,
  message,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-border-strong bg-surface-card px-6 py-10 text-center",
        className
      )}
    >
      <div
        aria-hidden
        className="flex size-13 items-center justify-center rounded-full bg-indigo-50 text-2xl"
      >
        {glyph}
      </div>
      <div className="font-heading text-xl text-text-strong">{title}</div>
      {message && (
        <div className="max-w-xs text-sm leading-normal text-text-muted">
          {message}
        </div>
      )}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}
