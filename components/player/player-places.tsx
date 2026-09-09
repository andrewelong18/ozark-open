import type { PlacePoint } from "@/lib/player-profile"
import { cn } from "@/lib/utils"

// A member's Ozark Open finishes, inside their profile modal (Sprint 26).
//
// This replaces the Sprint 18 bar chart, which plotted a score. A finishing
// place is a rank, not a magnitude: 1st isn't "twice as much" as 2nd, and the
// good end is the bottom, so a taller bar meaning a better year was backwards
// before it was anything else. One circle per year played says the true thing
// — the numeral IS the information, and the years that aren't there simply
// aren't drawn.
//
// Renders nothing on an empty series; the modal drops the whole section, so
// there's no empty state to design.

/** Gold for the win, a gold ring for the podium, indigo for everyone else.
 *  Color is never the only signal — the place is written inside the circle. */
function toneClasses(rank: number): string {
  if (rank === 1)
    return "bg-accent-gold text-accent-gold-foreground ring-1 ring-black/10"
  if (rank <= 3)
    return "bg-surface-sunken text-text-strong ring-2 ring-accent-gold"
  return "bg-surface-sunken text-text-strong ring-1 ring-border"
}

/** "tied for 15th" / "3rd" — the accessible reading of a place. */
function spoken(point: PlacePoint): string {
  const n = point.rank
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th"
  return `${point.tied ? "tied for " : ""}${n}${suffix}`
}

export function PlayerPlaces({
  data,
  className,
}: {
  data: PlacePoint[]
  className?: string
}) {
  if (data.length === 0) return null

  return (
    <ul
      className={cn("flex flex-wrap items-start gap-3 sm:gap-4", className)}
      aria-label="Past Ozark Open finishes"
    >
      {data.map((point) => (
        <li key={point.year} className="flex flex-col items-center gap-1.5">
          <span
            className={cn(
              // Fixed size so a "T15" and a "1" sit on the same grid; the
              // text steps down rather than the circle growing.
              "flex size-14 items-center justify-center rounded-full font-heading font-bold tabular sm:size-16",
              point.place.length > 2 ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
              toneClasses(point.rank)
            )}
            aria-label={`${spoken(point)} in ${point.year}`}
          >
            {point.place}
          </span>
          <span className="tabular text-[11px] font-semibold text-text-muted">
            {point.year}
          </span>
        </li>
      ))}
    </ul>
  )
}
