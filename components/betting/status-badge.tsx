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

/** Bet lifecycle badge — open / closed / resolved.
 *
 * The open state's dot breathes: a slow ring expands out of it and fades, the
 * way a live indicator does. This is the design system's one *ongoing*
 * animation outside a loading skeleton, and it earns the exception because it
 * carries information rather than decoration — "this bet is taking wagers right
 * now" is the single most time-sensitive fact on the page, and the difference
 * between Open and Closed is otherwise a colour and a word on a badge people
 * scan past. Closed and resolved dots are deliberately static: the moment a bet
 * stops being live, the motion stops too, which is what makes it mean anything.
 *
 * The ring is a sibling, not a transform on the dot, so the dot's own layout
 * never moves — and it is motion-safe: gated, because nothing here unmounts on
 * an animation event.
 */
export function StatusBadge({ status = "open", className }: StatusBadgeProps) {
  const s = STATUS[status] ?? STATUS.open
  const live = status === "open"
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-xs font-semibold whitespace-nowrap",
        s.className,
        className
      )}
    >
      <span className="relative inline-flex size-1.5 shrink-0">
        {live && (
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full opacity-75 motion-safe:animate-live-ping",
              s.dot
            )}
          />
        )}
        <span className={cn("relative inline-flex size-1.5 rounded-full", s.dot)} />
      </span>
      {s.label}
    </span>
  )
}
