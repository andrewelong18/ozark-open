import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/modules/empty-state"
import { getLeaderboard, formatToPar, type LeaderboardRow } from "@/lib/leaderboard"

// Sprint 8 — live standings mirrored from Pat's scoring workbook via the
// "Sportsbook Leaderboard" Google Sheet tab (read-only). The app never computes
// standings; it displays whatever the sheet says. Cached 5 minutes in
// lib/leaderboard.ts, so edits appear within the window ("Done when").
export const revalidate = 300

// Wide 8-column table: keep it above the fold on desktop, horizontally
// scrollable on mobile.
const GRID = "grid grid-cols-[40px_1fr_repeat(6,52px)] gap-2 px-4"

function ParCell({ value }: { value: number | null }) {
  const text = formatToPar(value)
  return (
    <span className="tabular text-right text-sm text-text-body">
      {text || <span className="text-text-muted">–</span>}
    </span>
  )
}

function PointsCell({ value }: { value: number | null }) {
  return (
    <span className="tabular text-right text-sm text-text-body">
      {value ?? <span className="text-text-muted">–</span>}
    </span>
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
        <Card className="gap-0 overflow-x-auto p-0">
          <div className="min-w-[520px]">
            <div
              className={`${GRID} border-b border-border py-2.5 text-[10px] font-bold tracking-wider uppercase text-text-muted`}
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
                className={`${GRID} items-center border-t border-border py-3 first:border-t-0${
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
                <span className="min-w-0 truncate text-sm font-semibold text-text-strong">
                  {row.player || "—"}
                </span>
                <PointsCell value={row.round1Points} />
                <PointsCell value={row.round2Points} />
                <span className="tabular text-right text-sm font-bold text-text-strong">
                  {row.totalPoints ?? <span className="text-text-muted">–</span>}
                </span>
                <ParCell value={row.startingStrokes} />
                <ParCell value={row.round3Score} />
                <ParCell value={row.finalScore} />
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
