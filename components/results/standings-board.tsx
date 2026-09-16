import { createClient } from "@/lib/supabase/server"
import { LoadError } from "@/components/modules/load-error"
import { StandingsToggle, type ScopeView } from "@/components/results/standings-toggle"
import { toPhaseEntry, toTournamentRules } from "@/lib/placements"
import { phaseRevealed, type PhaseBet } from "@/lib/phases"
import {
  buildResultsTables,
  normalizePayoutRows,
  type PayoutViewQueryRow,
  type ResultsParticipant,
  type ResultsScope,
} from "@/lib/payouts"

// The standings board (Sprint 30 / ADR 0002) — one component, two mounts.
//
// /standings (the nav's "Leaderboard") renders it as a page of its own; the
// dashboard EMBEDS it once tournaments.status flips to 'completed' (Sprint 28
// / #197 — Pat's swap: "replace the pool total, entry, bets placed, place
// bets, house rules, alerts, how the pool works sections within the dashboard
// with a clear leaderboard ranking of who won the most money. Also clear out
// the countdown."), keeping the dashboard's own header and rail. `heading`
// is what tells the two apart.
//
// IT IS THE STANDINGS AND NOTHING ELSE (Sept 16, 2026). The admin entry
// collection block, the activity feed and the sponsor carousel came off it:
// collection is on /admin/people, where the money is actually reconciled, and
// the feed and the ads belong to the dashboard, which supplies its own rail
// around this component when it embeds it.
//
// Each phase is its own pot with its own pari-mutuel split, plus a Combined
// view that adds a person's two rows. A phase's standings are shown only
// once every published bet in it is CLOSED (lib/phases.ts:phaseRevealed):
// RLS hides other people's rows on open bets, and a pot split over the rows a
// viewer happens to be allowed to see would be wrong money. Before that the
// tab shows the pot — every entry, which everyone can read — and says when
// the standings arrive.
//
// This component WRITES NO PAYOUT MATH. Every number comes from
// lib/payouts.ts:buildResultsTables(), which is Pat's formula per pot;
// lib/standings.ts decides only the order. If a number here disagrees with
// lib/payouts.ts, this file is the bug.

export async function StandingsBoard({
  tournamentRow,
  viewerUserId,
  heading = true,
}: {
  /** The row the page already read, passed down rather than re-fetched — it
   *  carries the rule columns the split needs. */
  tournamentRow: Record<string, unknown>
  viewerUserId: string | null
  /** false → the mount supplies its own page header (the finalized dashboard,
   *  which already prints the tournament name above its own rail). */
  heading?: boolean
}) {
  const supabase = await createClient()
  const tournamentId = String(tournamentRow.id)
  const tournamentName = String(tournamentRow.name)
  const completed = tournamentRow.status === "completed"
  const rules = toTournamentRules(tournamentRow)

  const [
    { data: participantData, error: participantError },
    { data: payoutData, error: payoutError },
    { data: phaseBetsData, error: phaseBetsError },
  ] = await Promise.all([
    supabase
      .from("tournament_participants")
      .select(
        "user_id, phase1_entry_fee, phase2_entry_fee, is_player, users ( display_name, nickname, avatar_url )"
      )
      .eq("tournament_id", tournamentId)
      // Revoked bettors leave the pool entirely — fees and wagers together
      // (Sprint 21 / #91; buildPhaseResults drops their payout rows to match).
      .is("revoked_at", null),
    supabase
      .from("placement_payouts_view")
      .select(
        "placement_id, user_id, amount, result, theoretical_payout, refunded_stake, phase, is_self_pick"
      )
      .eq("tournament_id", tournamentId),
    // `phase, status` — the reveal gate. A failure here stops the page:
    // without the bet statuses the board can't know which pot is safe to
    // show, and guessing is how wrong money gets on a screen.
    supabase.from("bets").select("phase, status").eq("tournament_id", tournamentId),
  ])

  // A dropped payout read renders a table of people who all won nothing,
  // which is a confident lie about money rather than an absence of data
  // (#132). All three stop the page.
  if (participantError || payoutError || phaseBetsError) {
    console.error(
      "[standings] read failed:",
      participantError?.message ?? payoutError?.message ?? phaseBetsError?.message
    )
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="the standings" />
      </div>
    )
  }

  type UserJoin = {
    display_name: string
    nickname: string | null
    avatar_url: string | null
  }
  type ParticipantRow = {
    user_id: string
    phase1_entry_fee: unknown
    phase2_entry_fee: unknown
    is_player: boolean
    users: UserJoin | UserJoin[] | null
  }
  const participants: ResultsParticipant[] = ((participantData ?? []) as ParticipantRow[]).map(
    (p) => {
      const joined = Array.isArray(p.users) ? p.users[0] : p.users
      return {
        user_id: p.user_id,
        display_name: joined?.display_name ?? "Unknown bettor",
        nickname: joined?.nickname ?? null,
        avatar_url: joined?.avatar_url ?? null,
        is_player: p.is_player,
        phase1_entry_fee: toPhaseEntry(p.phase1_entry_fee),
        phase2_entry_fee: toPhaseEntry(p.phase2_entry_fee),
      }
    }
  )
  const rows = normalizePayoutRows((payoutData ?? []) as unknown as PayoutViewQueryRow[])
  const tables = buildResultsTables(participants, rows, rules)

  const phaseBets = (phaseBetsData ?? []) as PhaseBet[]
  const revealed = { 1: phaseRevealed(1, phaseBets), 2: phaseRevealed(2, phaseBets) }
  const entrants = (phase: 1 | 2) =>
    participants.filter((p) => (phase === 1 ? p.phase1_entry_fee : p.phase2_entry_fee) !== null)
      .length
  const views: ScopeView[] = [
    { scope: 1, table: tables[1], revealed: revealed[1], entrants: entrants(1) },
    { scope: 2, table: tables[2], revealed: revealed[2], entrants: entrants(2) },
    {
      scope: "combined",
      table: tables.combined,
      revealed: revealed[1] && revealed[2],
      entrants: participants.filter(
        (p) => p.phase1_entry_fee !== null || p.phase2_entry_fee !== null
      ).length,
    },
  ]
  // Combined by default — unless only Phase 1 has closed, when opening on the
  // one table that exists beats opening on "not yet".
  const defaultScope: ResultsScope = revealed[1] && !revealed[2] ? 1 : "combined"

  return (
    <div
      data-enter-stagger
      className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6"
    >
      {heading && (
        <div>
          <h1 className="font-heading text-3xl leading-tight text-text-strong">
            {tournamentName}
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {completed
              ? "Final pari-mutuel shares, one pot per phase · no house, no rake"
              : "Pari-mutuel shares as they stand, one pot per phase · no house, no rake"}
          </p>
        </div>
      )}

      <StandingsToggle
        views={views}
        completed={completed}
        viewerUserId={viewerUserId}
        defaultScope={defaultScope}
      />
    </div>
  )
}
