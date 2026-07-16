import { cn } from "@/lib/utils"

export type Outcome = "hit" | "miss" | "push" | "void"

// Outcome triad + void. Always pairs color with a glyph + label so meaning
// survives a 25-row table and never rides on color alone (WCAG).
const OUTCOME: Record<
  Outcome,
  { label: string; glyph: string; className: string }
> = {
  hit: {
    label: "Hit",
    glyph: "✓",
    className: "border-win-border bg-win-surface text-win-strong",
  },
  miss: {
    label: "Miss",
    glyph: "✕",
    className: "border-loss-border bg-loss-surface text-loss-strong",
  },
  push: {
    label: "Push",
    glyph: "=",
    className: "border-neutral-border bg-neutral-surface text-ink-700",
  },
  void: {
    label: "Void",
    glyph: "∅",
    className: "border-neutral-border bg-neutral-surface text-ink-700",
  },
}

export type OutcomeBadgeProps = {
  outcome?: Outcome
  size?: "sm" | "md"
  className?: string
}

/** Bet outcome badge — hit / miss / push / void. Color + glyph + label. */
export function OutcomeBadge({
  outcome = "hit",
  size = "md",
  className,
}: OutcomeBadgeProps) {
  const o = OUTCOME[outcome] ?? OUTCOME.hit
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 font-bold whitespace-nowrap",
        size === "sm" ? "h-5 text-[11px]" : "h-6 text-xs",
        o.className,
        className
      )}
    >
      <span aria-hidden className="text-[1.05em] leading-none font-bold">
        {o.glyph}
      </span>
      {o.label}
    </span>
  )
}
