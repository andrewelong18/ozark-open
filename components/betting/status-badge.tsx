import { cn } from "@/lib/utils"

export type BetStatus = "open" | "closed" | "resolved"

// Bet lifecycle. 'draft' is never surfaced. Open = inviting green, closed =
// neutral, resolved = quiet indigo. Color is always paired with a label.
const STATUS: Record<
  BetStatus,
  { label: string; className: string; dot: string }
> = {
  open: {
    label: "Open",
    className: "border-status-open-border bg-status-open-surface text-status-open",
    dot: "bg-win",
  },
  closed: {
    label: "Closed",
    className:
      "border-status-closed-border bg-status-closed-surface text-status-closed",
    dot: "bg-ink-400",
  },
  resolved: {
    label: "Resolved",
    className:
      "border-status-resolved-border bg-status-resolved-surface text-status-resolved",
    dot: "bg-indigo-500",
  },
}

export type StatusBadgeProps = {
  status?: BetStatus
  className?: string
}

/** Bet lifecycle badge — open / closed / resolved. */
export function StatusBadge({ status = "open", className }: StatusBadgeProps) {
  const s = STATUS[status] ?? STATUS.open
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-xs font-semibold whitespace-nowrap",
        s.className,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  )
}
