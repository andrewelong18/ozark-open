import Link from "next/link"
import { cn } from "@/lib/utils"
import { MoneyDisplay } from "@/components/betting/money-display"
import type { ComplianceItem } from "@/lib/my-bets"

// Bet-slip review summary (Sprint 17 · Competitive Analysis §1.3). A sticky
// footer bar on /bets that keeps "am I balanced?" answered while the
// participant scrolls the menu — the review-at-the-moment-of-placing surface,
// not a draft bet slip. Every number is handed in precomputed by the page
// from the same lib/validation.ts + lib/my-bets.ts helpers /my-bets uses, so
// the two views can never disagree. Server component: it re-renders on the
// router.refresh() each placement already fires.

export type BetSlipSummaryProps = {
  entryFee: number
  totalWagered: number
  /** Entry fee minus total wagered; never negative (the running-total rule
   * caps it at the entry — PRD §7 rule 6). */
  remaining: number
  pickCount: number
  /** From buildComplianceSummary — empty only when nothing is placed yet. */
  items: ComplianceItem[]
}

type Tone = "warning" | "success" | "info"

const DOT: Record<Tone, string> = {
  warning: "bg-caution-strong",
  success: "bg-win-strong",
  info: "bg-indigo-700",
}
const TEXT: Record<Tone, string> = {
  warning: "text-caution-strong",
  success: "text-win-strong",
  info: "text-text-muted",
}

export function BetSlipSummary({
  entryFee,
  totalWagered,
  remaining,
  pickCount,
  items,
}: BetSlipSummaryProps) {
  // Headline = the highest-priority standing. With no picks there's nothing to
  // warn about; once betting, buildComplianceSummary always returns at least
  // one item (a warning, or the "you're balanced" success), so items[0] leads.
  const lead = items[0]
  const tone: Tone = pickCount === 0 ? "info" : (lead?.tone ?? "info")
  const headline =
    pickCount === 0
      ? "No picks placed yet"
      : tone === "warning" && remaining > 0
        ? `${lead.title} · $${remaining} to go`
        : lead.title

  return (
    <aside className="sticky bottom-0 z-20 -mx-4 px-4 pt-2 pb-3">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-card px-4 py-3 shadow-[0_-2px_16px_rgba(31,29,60,0.12)]">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <MoneyDisplay value={totalWagered} size="md" weight="bold" />
            <span className="text-sm text-text-muted">
              of ${entryFee}
              {pickCount > 0 && (
                <>
                  {" · "}
                  {pickCount} {pickCount === 1 ? "pick" : "picks"}
                </>
              )}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", DOT[tone])}
            />
            <span className={cn("truncate font-semibold", TEXT[tone])}>
              {headline}
            </span>
          </div>
        </div>
        <Link
          href="/my-bets"
          className="shrink-0 text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline"
        >
          Review all →
        </Link>
      </div>
    </aside>
  )
}
