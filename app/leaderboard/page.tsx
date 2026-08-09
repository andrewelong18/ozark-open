import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/modules/empty-state"
import { getLeaderboard, formatToPar, type LeaderboardRow } from "@/lib/leaderboard"

// Sprint 8 — live standings mirrored from Pat's scoring workbook via the
// "Sportsbook Leaderboard" Google Sheet tab (read-only). The app never computes
// standings; it displays whatever the sheet says. Cached 5 minutes in
// lib/leaderboard.ts, so edits appear within the window ("Done when").
export const revalidate = 300

// Wide 8-column table on a laptop; on a phone it stacks instead of scrolling
// sideways (Sprint 9). Same move as components/admin/people-console: the
// mobile grid is position + name + a right-hand stack, and `sm:contents` on
// that stack promotes its children into the real 8-column grid once there's
// room. A 520px scroller was the old answer, and it meant a leaderboard you
// had to drag to read on the one device it's read on.
const GRID =
  "grid grid-cols-[28px_1fr] items-baseline gap-x-2 px-4 sm:grid-cols-[40px_1fr_repeat(6,52px)]"

// One score cell. The header row only exists at sm+, so on a phone each value
// carries its own label — otherwise the stacked line is six bare numbers.
function ScoreCell({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`tabular text-sm text-text-body sm:text-right ${className ?? ""}`}
    >
      <span className="mr-1 text-[10px] font-bold tracking-wider text-text-muted uppercase sm:hidden">
        {label}
      </span>
      {children}
    </span>
  )
}

function ParCell({ label, value }: { label: string; value: number | null }) {
  const text = formatToPar(value)
  return (
    <ScoreCell label={label}>
      {text || <span className="text-text-muted">–</span>}
    </ScoreCell>
  )
}

function PointsCell({ label, value }: { label: string; value: number | null }) {
  return (
    <ScoreCell label={label}>
      {value ?? <span className="text-text-muted">–</span>}
    </ScoreCell>
  )
}

export default async function LeaderboardPage() {
  let rows: LeaderboardRow[] | null = null
  try {
    rows = await getLeaderboard()
  } catch {
    // Env not configured yet, sheet not shared, or a transient API error —
    // show the waiting state rather than a crash.
    rows = null
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          Leaderboard
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Live standings from the scoring workbook
        </p>
      </div>

      {!rows || rows.length === 0 ? (
        <EmptyState
          glyph="⛳"
          title="No standings yet"
          message="Standings appear here once Pat posts the day's scores from the workbook."
        />
      ) : (
        <Card className="gap-0 p-0">
          <div>
            {/* Column headings belong to the 8-column layout only — on a phone
                the values label themselves (see ScoreCell). */}
            <div
              className={`${GRID} hidden border-b border-border py-2.5 text-[10px] font-bold tracking-wider uppercase text-text-muted sm:grid`}
            >
              <span>Pos</span>
              <span>Player</span>
              <span className="text-right">R1</span>
              <span className="text-right">R2</span>
              <span className="text-right">Total</span>
              <span className="text-right">Start</span>
              <span className="text-right">R3</span>
              <span className="text-right">Final</span>
            </div>
            {rows.map((row, i) => (
              <div
                key={`${row.position}-${row.player}-${i}`}
                className={`${GRID} border-t border-border py-3 first:border-t-0 sm:items-center${
                  i === 0 ? " bg-gold-100" : ""
                }`}
              >
                <span
                  className={
                    "tabular text-sm font-bold " +
                    (i === 0 ? "text-gold-700" : "text-text-muted")
                  }
                >
                  {row.position || "–"}
                </span>
                <span className="min-w-0 text-sm font-semibold text-text-strong">
                  {row.player || "—"}
                </span>
                {/* On a phone the six scores wrap under the name, in reading
                    order, each labelled. At sm+ `contents` dissolves this
                    wrapper and they become the last six grid columns. */}
                <div className="col-start-2 flex flex-wrap gap-x-3 gap-y-0.5 pt-1 sm:contents">
                  <PointsCell label="R1" value={row.round1Points} />
                  <PointsCell label="R2" value={row.round2Points} />
                  <ScoreCell label="Total" className="font-bold text-text-strong">
                    {row.totalPoints ?? <span className="text-text-muted">–</span>}
                  </ScoreCell>
                  <ParCell label="Start" value={row.startingStrokes} />
                  <ParCell label="R3" value={row.round3Score} />
                  <ParCell label="Final" value={row.finalScore} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="text-center text-xs text-text-muted">
        Standings mirror the scoring workbook and refresh every few minutes.
        Scores show as strokes to par (E = even).
      </p>
    </div>
  )
}
