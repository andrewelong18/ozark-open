import { cn } from "@/lib/utils"
import { MoneyDisplay } from "@/components/betting/money-display"
import { AccordionSection } from "@/components/ui/accordion-section"

export type RulesCardPhase = {
  phase: 1 | 2
  entryFee: number
  /** null hides the row — non-playing bettors are exempt from the self-bet
   * cap (PRD §12 Q14). */
  maxSelf: number | null
}

export type RulesCardProps = {
  /** Flat, the same in every phase (PRD §7 rule 4). */
  maxSingle?: number
  /** Fewest picks in each phase you are entered in. */
  minPicks?: number
  /** The per-phase floor — the part of an entry that is committed either way
   * (ADR 0002 §2). A rule parameter, so it comes off the tournaments row. */
  entryFeeMin?: number
  /** One block per phase the bettor is entered in. */
  phases?: RulesCardPhase[]
  className?: string
}

/**
 * Personalized "house rules" reference card — the flat single-bet cap, the
 * per-phase pick minimum, and per phase: the entry and the self-bet cap.
 * Reference-card energy (clean rows), not legal-terms energy.
 *
 * Collapsed by default. These numbers are the same every time you look and the
 * app enforces them anyway (lib/validation.ts), so on the two pages that carry
 * this card they were rows of settled fact between you and the thing you
 * came for. The label stays visible; the table is one tap away.
 */
export function RulesCard({
  maxSingle = 10,
  minPicks = 5,
  entryFeeMin = 20,
  phases = [
    { phase: 1, entryFee: 40, maxSelf: 10 },
    { phase: 2, entryFee: 20, maxSelf: 5 },
  ],
  className,
}: RulesCardProps) {
  const rows: { label: string; node: React.ReactNode }[] = [
    {
      label: "Max single bet",
      node: <MoneyDisplay value={maxSingle} size="sm" weight="semibold" />,
    },
    { label: "Picks per phase", node: `${minPicks} min · no max` },
    ...phases.flatMap((p) => [
      {
        label: `Phase ${p.phase} entry — wager it all`,
        node: <MoneyDisplay value={p.entryFee} size="sm" weight="semibold" />,
      },
      ...(p.maxSelf !== null
        ? [
            {
              label: `Phase ${p.phase} max on yourself`,
              node: <MoneyDisplay value={p.maxSelf} size="sm" weight="semibold" />,
            },
          ]
        : []),
    ]),
  ]

  return (
    <AccordionSection
      title="House Rules"
      glyph="⛳"
      className={className}
      // Flush: the rows carry their own dividers and full-bleed edges, which a
      // padded panel would inset into a box-inside-a-box.
      bodyClassName=""
    >
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
      <p className="border-t border-border px-4 py-2.5 text-xs text-text-muted">
        Each phase is its own pot. Wager less than your entry and the first{" "}
        {`$${entryFeeMin}`} stays in the pot; the rest comes back. Self-bets
        count only up to a quarter of what you actually wager.
      </p>
    </AccordionSection>
  )
}
