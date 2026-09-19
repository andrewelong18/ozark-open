"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { PlayerChip } from "@/components/player/player-chip"
import { MoneyDisplay } from "@/components/betting/money-display"
import { EmptyState } from "@/components/modules/empty-state"
import { StandingsTable } from "@/components/results/standings-table"
import { cashReturned, type ResultsScope, type ResultsTable } from "@/lib/payouts"
import { standingsLeader } from "@/lib/standings"

// Phase 1 / Phase 2 / Combined (Sprint 30 / ADR 0002). Each phase is its own
// pot with its own pari-mutuel split; Combined is the per-person SUM of the
// two rows — never a split of one merged pot — and its "pool" badge is the
// two pots added up.
//
// Client component for one reason: which scope is showing. Every number
// arrives already computed by lib/payouts.ts:buildResultsTables(); the
// server decided what is revealed. This file decides nothing about money.

export type ScopeView = {
  scope: ResultsScope
  table: ResultsTable
  /** Every published bet in the scope is closed, so the split is right money
   * for every viewer. False → the pot shows, the standings don't. */
  revealed: boolean
  /** Distinct people with an entry in the scope. */
  entrants: number
}

const LABEL: Record<ResultsScope, string> = { 1: "Phase 1", 2: "Phase 2", combined: "Combined" }

/** Whole dollars stay whole; a pool that split to cents shows them. */
function dollars(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`
}

function scopeNoun(scope: ResultsScope): string {
  return scope === "combined" ? "both pots" : `the Phase ${scope} pot`
}

export function StandingsToggle({
  views,
  completed,
  viewerUserId,
  defaultScope,
}: {
  views: ScopeView[]
  /** tournaments.status = completed — the only state that can say "Final". */
  completed: boolean
  viewerUserId: string | null
  defaultScope: ResultsScope
}) {
  const [scope, setScope] = useState<ResultsScope>(defaultScope)
  const view = views.find((v) => v.scope === scope) ?? views[views.length - 1]
  const { table } = view
  // Pinned to profit/loss descending — Pat's ranking axis — and deliberately
  // NOT "whatever the viewer sorted to the top". See lib/standings.ts.
  const winner = view.revealed ? standingsLeader(table.rows) : null
  // Gold on the leader is a verdict: only once the tournament is completed
  // AND every wager in the scope has a result (#108).
  const settled = completed && table.pending === 0
  const undistributed =
    view.revealed && table.pending === 0 && table.sum_theoretical === 0 && table.pool > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The toggle. Three pills, one pressed; the same chip treatment as
            the standings table's phone sort control. */}
        <div
          role="group"
          aria-label="Standings scope"
          className="flex flex-wrap items-center gap-1.5"
        >
          {views.map((v) => {
            const active = v.scope === scope
            return (
              <button
                key={String(v.scope)}
                type="button"
                onClick={() => setScope(v.scope)}
                aria-pressed={active}
                data-testid={`standings-scope-${v.scope}`}
                className={
                  "min-h-9 rounded-full border px-3 text-sm font-semibold transition-colors " +
                  (active
                    ? "border-indigo-300 bg-indigo-100 text-indigo-800"
                    : "border-border bg-surface-card text-text-muted hover:text-text-strong")
                }
              >
                {LABEL[v.scope]}
              </button>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="neutral" uppercase>
            {completed ? "Final" : "As it stands"}
          </Badge>
          {/* Before the reveal the badge is the POT — every entry, which RLS
              lets everyone read. After it, the POOL the split hands out:
              committed money minus voided stakes. */}
          <Badge variant="gold" uppercase>
            {view.revealed ? `Pool ${dollars(table.pool)}` : `Pot ${dollars(table.entries)}`}
          </Badge>
        </div>
      </div>

      {!view.revealed ? (
        <Card className="p-4 text-sm text-text-body" data-testid="standings-unrevealed">
          <span className="font-semibold text-text-strong">
            {scope === "combined"
              ? "Standings appear once both phases' bets have closed."
              : `Standings appear once Phase ${scope}'s bets have closed.`}
          </span>{" "}
          {table.entries > 0
            ? `${dollars(table.entries)} in from ${view.entrants} ${view.entrants === 1 ? "entry" : "entries"} so far. Nobody's picks show until a bet closes, so nothing here can be split yet.`
            : "No entries recorded yet."}
        </Card>
      ) : table.rows.length === 0 ? (
        <EmptyState
          title={scope === "combined" ? "No participants" : `Nobody entered Phase ${scope}`}
          message={
            scope === "combined"
              ? "Nobody was registered for this tournament."
              : `No entries were recorded for Phase ${scope}, so there is no pot to split.`
          }
        />
      ) : (
        <>
          {/* Provisional state (Sprint 25 / #108): shares computed while picks
              are still unresolved. aggregatePayouts SKIPS a pending placement
              rather than scoring it zero, so every share is split across a
              shrunken denominator and reads too high. Say so in those terms —
              "not final" undersells it — and suppress the winner spotlight,
              which is the screenshot that would travel. */}
          {table.pending > 0 && (
            <Card className="border-caution-border bg-caution-surface p-4 text-sm text-caution-strong">
              <span className="font-semibold">
                Provisional — {table.pending} wager
                {table.pending === 1 ? "" : "s"} in {scopeNoun(scope)} still{" "}
                {table.pending === 1 ? "has" : "have"} no result.
              </span>{" "}
              Every share below is split across only the settled wagers, so the
              numbers read high. They settle once the last results are uploaded.
            </Card>
          )}

          {/* A pot nobody's wager cashed in. The split has nothing to divide
              by, so the money sits — Pat's call what happens to it (filed as
              an open question with Sprint 30). */}
          {undistributed && (
            <Card className="border-border bg-surface-sunken p-4 text-sm text-text-body">
              <span className="font-semibold text-text-strong">
                Nothing in {scopeNoun(scope)} paid out.
              </span>{" "}
              No wager hit, so its {dollars(table.pool)} has no share to be split
              into. What happens to it is an admin decision, not the app&apos;s.
            </Card>
          )}

          {/* Winner spotlight — the screenshot people share, which is exactly
              why it waits for a settled table. Pinned to profit/loss
              descending: Pat's ranking axis is "who won the most money", and
              with entries varying that is not the same person as the biggest
              payout. */}
          {settled && winner && (
            // STACKED ON A PHONE, side by side from `sm` up. Side by side at
            // every width is what shipped, and at 390px the winner's name —
            // Azalea, 2xl, glyphs that overhang their box — ran straight into
            // the payout beside it.
            <div className="flex flex-col gap-3 rounded-xl bg-surface-inverse p-5 shadow-md sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-bold tracking-wider text-gold-300 uppercase">
                  Biggest Winner{scope === "combined" ? "" : ` · Phase ${scope}`}
                </div>
                <PlayerChip
                  userId={winner.user_id}
                  displayName={winner.display_name}
                  nickname={winner.nickname}
                  avatarUrl={winner.avatar_url}
                  size="md"
                  tone="onDark"
                  underline
                  className="mt-1 max-w-full"
                  nameClassName="font-heading text-xl leading-tight text-white sm:text-2xl"
                  nicknameClassName="text-gold-300"
                />
              </div>
              <div className="flex shrink-0 items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0.5">
                <MoneyDisplay
                  // The same figure as their Payout cell below. Showing
                  // `actual` here while the row shows the cash returned would
                  // put two different numbers against one name on one screen.
                  value={cashReturned(winner)}
                  cents
                  size="xl"
                  className="text-gold-400"
                />
                <MoneyDisplay value={winner.profit_loss} cents pl onDark size="sm" />
              </div>
            </div>
          )}

          <h2 className="font-heading text-lg text-text-strong">
            {completed ? "Final Standings" : "Standings"}
            {scope === "combined" ? "" : ` · Phase ${scope}`}
          </h2>

          <StandingsTable
            rows={table.rows}
            pending={settled ? 0 : Math.max(1, table.pending)}
            leaderUserId={winner?.user_id ?? null}
            viewerUserId={viewerUserId}
          />

          <p className="text-center text-xs text-text-muted">
            {scope === "combined" ? (
              <>
                Each phase is its own pot and its own split; Combined adds your
                two rows together — it is never one merged pot. Payout is the
                cash that comes back to you: your shares plus any refunds.
              </>
            ) : (
              <>
                Actual share = your recognised theoretical payout ÷
                everyone&apos;s × the {dollars(table.pool)} Phase {scope} pool.
                The pool is every Phase {scope} entry that was committed minus
                voided stakes, which come back. Entry money that went unwagered
                comes back too — above the minimum if you wagered some of it,
                all of it if you wagered none — and is included in Payout. No
                house, no rake — the pool pays itself out.
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
