import { cn } from "@/lib/utils"
import { MoneyDisplay } from "@/components/betting/money-display"
import { AccordionSection } from "@/components/ui/accordion-section"

export type RulesCardProps = {
  entryFee?: number
  maxSingle?: number
  /** null hides the row — non-playing bettors are exempt from the self-bet
   * cap (PRD §12 Q14). */
  maxSelf?: number | null
  /** Fewest picks across BOTH phases combined (#96). */
  minBets?: number
  /** Most picks in any one phase. */
  maxBets?: number
  className?: string
}

/**
 * Personalized "house rules" reference card — entry fee, max single/self bet,
 * pick counts. Reference-card energy (clean rows), not legal-terms energy.
 *
 * Collapsed by default. These numbers are the same every time you look and the
 * app enforces them anyway (lib/validation.ts), so on the two pages that carry
 * this card they were six rows of settled fact between you and the thing you
 * came for. The label stays visible; the table is one tap away.
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
    ...(maxSelf !== null
      ? [
          {
            label: "Max bet on yourself",
            node: <MoneyDisplay value={maxSelf} size="sm" weight="semibold" />,
          },
        ]
      : []),
    // The minimum spans the tournament, the maximum is per phase (#96) — two
    // rows, because one "5–10" row is exactly the conflation that misled.
    { label: "Picks, both phases", node: `${minBets} min` },
    { label: "Picks per phase", node: `${maxBets} max` },
    {
      label: "Total must equal",
      node: <MoneyDisplay value={entryFee} size="sm" weight="semibold" />,
    },
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
    </AccordionSection>
  )
}
