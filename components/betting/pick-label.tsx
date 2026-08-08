import { cn } from "@/lib/utils"
import { PlayerNameLink } from "@/components/player/player-name-link"
import { splitPickLabel } from "@/lib/pick-label"

/**
 * A pick's label: the golfer's name, with their stroke handicap beside it as a
 * badge rather than glued into the name (#102).
 *
 * "Jake Kohne (E)" reads as **Jake Kohne** + `E`. The profile link wraps the
 * NAME ONLY — the badge sits outside it — so tapping a name opens a person,
 * not a person-and-a-number.
 *
 * The split comes from lib/pick-label.ts, the same module the importer uses to
 * match picks to people. That is deliberate and load-bearing: if display and
 * matching ever diverged, a label would render perfectly while silently
 * linking to nobody, and the §7 self-bet cap, self-pick flag and opponent
 * block all key off that link.
 *
 * Labels with no handicap ("Field", "Yes", "No") render as plain text with no
 * badge, exactly as before.
 */
export function PickLabel({
  label,
  playerUserId = null,
  playerAvatarUrl = null,
  className,
  nameClassName,
  onNameClick,
}: {
  /** The sheet's pick label, verbatim — split for display, never mutated. */
  label: string
  playerUserId?: string | null
  playerAvatarUrl?: string | null
  className?: string
  nameClassName?: string
  /** Pick-one bets make the whole unlinked label a selection target. */
  onNameClick?: () => void
}) {
  const { name, stroke } = splitPickLabel(label)

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      {playerUserId ? (
        <PlayerNameLink
          userId={playerUserId}
          label={name}
          avatarUrl={playerAvatarUrl}
          className="min-w-0"
          nameClassName={nameClassName}
        />
      ) : onNameClick ? (
        <button
          type="button"
          onClick={onNameClick}
          className={cn(
            "min-w-0 cursor-pointer text-left text-pretty",
            nameClassName
          )}
        >
          {name}
        </button>
      ) : (
        <span className={cn("min-w-0 text-pretty", nameClassName)}>{name}</span>
      )}
      {stroke && <StrokeBadge stroke={stroke} />}
    </span>
  )
}

/**
 * The handicap chip. Quiet on purpose — it is a qualifier on the name, not a
 * status, so it stays neutral and never competes with the odds chip or an
 * outcome badge for attention. Squared-ish like the odds chip (6px), tabular
 * so "-10" and "+2" line up down a card.
 */
export function StrokeBadge({
  stroke,
  className,
}: {
  stroke: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "tabular inline-flex h-5 shrink-0 items-center justify-center rounded-md border border-border bg-surface-sunken px-1.5 text-[11px] font-semibold text-text-muted",
        className
      )}
      // The bare "E"/"-10" is sportsbook shorthand; the title spells it out
      // for anyone who does not already read it as strokes.
      title={`${stroke === "E" || stroke === "e" ? "Even" : stroke} strokes`}
    >
      {stroke}
    </span>
  )
}
