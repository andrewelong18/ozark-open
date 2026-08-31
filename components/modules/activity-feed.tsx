"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { formatElapsedShort, formatTimestamp } from "@/lib/format"
import { phaseEventText, type ActivityEvent } from "@/lib/activity"
import { PlayerNameLink } from "@/components/player/player-name-link"
import { Avatar } from "@/components/avatar"
import { Card } from "@/components/ui/card"
import { Collapse } from "@/components/ui/collapse"
import { EmptyState } from "@/components/modules/empty-state"

/**
 * The dashboard's activity feed: a chat-shaped timeline of who is playing.
 *
 * Three event kinds, newest at the top, new arrivals animating in and pushing
 * the rest down. A bet event is a linked profile name, "placed a bet", and a
 * timestamp — deliberately NOT the pick, the amount or the odds, which stay
 * behind the bet closing (PRD §8, §12; the column list in
 * public.activity_placements() is what actually enforces it).
 *
 * The house lines (lib/activity-quips.ts) render through that same row, on
 * purpose: linked name, avatar, stamp, indistinguishable from a wager. They are
 * fiction and read as fact — that is the joke, and it costs the paragraph above
 * nothing, because no line is derived from data.
 *
 * "Real time" here is a 20-second poll plus a refetch when the tab comes back,
 * which is the boundary COMPETITIVE_ANALYSIS §2.5 draws: PRD §3's ban is on a
 * live tote board that moves odds, not on a page that stops showing stale data.
 * No websockets, no Realtime service.
 *
 * The list rendered is exactly what the server returned — the client never
 * re-derives or re-sorts it. Feed composition (including which quips land
 * where) is decided once, deterministically, in lib/activity.ts, so a poll
 * cannot deal a different hand and re-animate the screen.
 */

/** Slow enough to be invisible on a phone battery, fast enough that a wager
 *  placed at the table shows up before anyone mentions it out loud. */
const POLL_MS = 20_000

export type ActivityFeedProps = {
  /** Server-rendered first page, so the rail is populated on first paint. */
  initialEvents: ActivityEvent[]
  /** The server's clock at render, so a relative timestamp computed during SSR
   *  and again during hydration agree (see RelativeStamp). */
  serverNow: string
  className?: string
}

export function ActivityFeed({
  initialEvents,
  serverNow,
  className,
}: ActivityFeedProps) {
  const [events, setEvents] = React.useState(initialEvents)

  // What the previous render knew, for deciding which rows are ARRIVALS. A ref
  // rather than state: it must update without causing a render of its own, and
  // nothing reads it during one.
  const seen = React.useRef<{ ids: Set<string>; newestAt: number }>({
    ids: new Set(initialEvents.map((e) => e.id)),
    newestAt: newestTimestamp(initialEvents),
  })
  const [arrivals, setArrivals] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      // A hidden tab has nobody watching it; the visibility listener below
      // catches up the moment it comes back.
      if (typeof document !== "undefined" && document.hidden) return
      try {
        const res = await fetch("/api/activity", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { events?: ActivityEvent[] }
        if (cancelled || !Array.isArray(data.events)) return

        const next = data.events
        // An arrival is a row that is BOTH unseen and newer than anything we
        // had. Unseen alone is not enough: the server's window slides, so an
        // old row can re-enter the list from the bottom, and animating that
        // would flash a five-hour-old wager as if it just happened.
        const previous = seen.current
        const fresh = new Set(
          next
            .filter(
              (e) =>
                !previous.ids.has(e.id) &&
                new Date(e.at).getTime() >= previous.newestAt
            )
            .map((e) => e.id)
        )
        seen.current = {
          ids: new Set(next.map((e) => e.id)),
          newestAt: Math.max(previous.newestAt, newestTimestamp(next)),
        }
        setArrivals(fresh)
        setEvents(next)
      } catch {
        // Offline, or the tab is being torn down. The next tick tries again;
        // a feed is not worth an error banner over the money on this page.
      }
    }

    const id = setInterval(load, POLL_MS)
    const onWake = () => {
      if (!document.hidden) load()
    }
    document.addEventListener("visibilitychange", onWake)
    window.addEventListener("focus", onWake)

    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener("visibilitychange", onWake)
      window.removeEventListener("focus", onWake)
    }
  }, [])

  if (events.length === 0) {
    // Same testid as the populated card: a spec asking "what does the activity
    // rail say" should not have to know which branch rendered.
    return (
      <div data-testid="activity-feed" className={className}>
        <EmptyState
          glyph="📣"
          title="No activity yet"
          message="Wagers, phase openings and pool news will show up here."
        />
      </div>
    )
  }

  return (
    <Card
      data-testid="activity-feed"
      size="sm"
      className={cn("gap-0 overflow-hidden p-0", className)}
    >
      {/* aria-live is deliberately OFF, the same call the Countdown makes: this
          is ambient colour that changes every few seconds all weekend, and
          announcing each row would talk over everything else on the page. */}
      <ul
        aria-live="off"
        className="max-h-[26rem] overflow-y-auto overscroll-contain px-3 py-1"
      >
        {events.map((event) => (
          <li key={event.id}>
            <FeedRow event={event} arriving={arrivals.has(event.id)} serverNow={serverNow} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function newestTimestamp(events: ActivityEvent[]): number {
  return events.reduce((max, e) => {
    const at = new Date(e.at).getTime()
    return Number.isNaN(at) ? max : Math.max(max, at)
  }, 0)
}

/**
 * One row, and the streaming-in behaviour.
 *
 * An arriving row mounts CLOSED and opens on the next frame, so Collapse's
 * `0fr → 1fr` track animates its height — which is what pushes the rest of the
 * timeline down rather than snapping it. That two-frame dance (and why it can't
 * be done in one commit) is documented in components/ui/collapse.tsx; this is
 * the same mechanism the closed-bet reveal uses, not a second copy of it.
 *
 * A row that was already on screen mounts open and animates nothing.
 */
function FeedRow({
  event,
  arriving,
  serverNow,
}: {
  event: ActivityEvent
  arriving: boolean
  serverNow: string
}) {
  const [open, setOpen] = React.useState(!arriving)

  // Opened from inside a frame callback rather than straight out of the effect:
  // a bare setState there is what react-hooks/set-state-in-effect rejects, and
  // Collapse itself opens the same way for the same reason. The extra frame is
  // free — Collapse needs one of its own before it can animate from 0fr anyway.
  React.useEffect(() => {
    if (open) return
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  return (
    <Collapse open={open}>
      <div
        // No dividers: a chat is a stream, not a table, and the member rows
        // and phase milestones already carry the rhythm a rule would.
        className={cn(
          "py-1.5",
          arriving && "motion-safe:animate-fade-in-soft"
        )}
      >
        <RowBody event={event} serverNow={serverNow} />
      </div>
    </Collapse>
  )
}

function RowBody({
  event,
  serverNow,
}: {
  event: ActivityEvent
  serverNow: string
}) {
  // A wager and a house line render through the SAME component, differing only
  // in the words after the name and in a testid nobody can see. That is
  // deliberate (Andrew, Aug 31, 2026): the lines are supposed to pass for real
  // events, and one renderer is the only way "identical" stays true as either
  // one changes. The testids exist so e2e/activity-feed.spec.ts can still tell
  // them apart when it checks that no REAL row leaks a position.
  if (event.kind === "bet") {
    return (
      <MemberRow
        testId="activity-bet-row"
        userId={event.userId}
        name={event.name}
        avatarUrl={event.avatarUrl}
        // General on purpose: there is no pick and no amount to say, and there
        // won't be one until the bet closes and /bets reveals the lot.
        text="placed a bet"
        at={event.at}
        serverNow={serverNow}
      />
    )
  }

  if (event.kind === "quip") {
    return (
      <MemberRow
        testId="activity-quip-row"
        userId={event.userId}
        name={event.name}
        avatarUrl={event.avatarUrl}
        text={event.line}
        at={event.at}
        serverNow={serverNow}
      />
    )
  }

  return (
    <div className="flex items-center gap-2 px-1">
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          event.kind === "phase_open" ? "bg-win" : "bg-text-muted"
        )}
      />
      <span className="min-w-0 flex-1 text-xs font-semibold text-pretty text-text-strong">
        {phaseEventText(event)}
      </span>
      <RelativeStamp at={event.at} serverNow={serverNow} />
    </div>
  )
}

/**
 * A member did a thing: their name, what they did, when.
 *
 * `items-start` with the text in a flowing column rather than a single-line
 * flex, because a house line runs long ("took out a second mortgage for more
 * sportsbook bets") and has to wrap under the name in a 357px rail while the
 * stamp stays pinned to the first line. PlayerNameLink is inline-flex, so the
 * name and its avatar sit in that flow rather than beside it.
 *
 * An unlinked name is plain text at the same size and weight — the same thing
 * PickLabel does for a pick that matches no member, so a joke about someone
 * without an account still reads, it just doesn't open a profile.
 */
function MemberRow({
  testId,
  userId,
  name,
  avatarUrl,
  text,
  at,
  serverNow,
}: {
  testId: string
  userId: string | null
  name: string
  avatarUrl: string | null
  text: string
  at: string
  serverNow: string
}) {
  return (
    <div data-testid={testId} className="flex items-start gap-1.5 px-1">
      <p className="min-w-0 flex-1 text-xs leading-snug text-pretty text-text-muted">
        {userId ? (
          <PlayerNameLink
            userId={userId}
            label={name}
            avatarUrl={avatarUrl}
            className="mr-1 align-middle"
            nameClassName="text-xs font-semibold text-text-strong"
          />
        ) : (
          // No account yet, so no profile to open — but it still gets the
          // initials avatar, because a row that looks different is a row a
          // reader treats differently, and these are meant to read alike.
          <span className="mr-1 inline-flex items-center gap-1.5 align-middle">
            <span className="text-xs font-semibold text-text-strong">{name}</span>
            <Avatar name={name} size="xs" />
          </span>
        )}
        {text}
      </p>
      <RelativeStamp at={at} serverNow={serverNow} className="mt-px" />
    </div>
  )
}

/** Bucketed to 30s: a "4m" that never goes stale, without a once-a-second
 *  render of a list this long. */
function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 30_000)
  return () => clearInterval(id)
}
const clientSnapshot = () => Math.floor(Date.now() / 30_000) * 30_000

/**
 * The relative timestamp.
 *
 * getServerSnapshot returns the SERVER's clock, not null and not the browser's:
 * React calls it for the SSR render and again during hydration, so both compute
 * "4m" from the same instant and the markup matches. The client
 * clock takes over on the first tick after that.
 */
function RelativeStamp({
  at,
  serverNow,
  className,
}: {
  at: string
  serverNow: string
  className?: string
}) {
  const serverSnapshot = React.useCallback(
    () => new Date(serverNow).getTime(),
    [serverNow]
  )
  const now = React.useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot
  )

  return (
    <time
      dateTime={at}
      title={formatTimestamp(at)}
      className={cn(
        "tabular shrink-0 text-[10px] whitespace-nowrap text-text-muted",
        className
      )}
    >
      {formatElapsedShort(at, now)}
    </time>
  )
}
