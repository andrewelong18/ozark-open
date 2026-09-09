import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PlayerChip } from "@/components/player/player-chip"
import { EmptyState } from "@/components/modules/empty-state"
import { LoadError } from "@/components/modules/load-error"
import { MoneyDisplay } from "@/components/betting/money-display"
import { SettlementSummary } from "@/components/results/settlement-summary"
import { StandingsTable } from "@/components/results/standings-table"
import { ActivityFeed } from "@/components/modules/activity-feed"
import { AdCarousel } from "@/components/ads/ad-carousel"
import { ads } from "@/lib/ads"
import { loadActivityFeed } from "@/lib/activity-source"
import type { FeedBet } from "@/lib/activity"
import { toPhaseClock } from "@/lib/placements"
import {
  buildResultsTable,
  cashReturned,
  normalizePayoutRows,
  type PayoutViewQueryRow,
} from "@/lib/payouts"
import { standingsLeader } from "@/lib/standings"
import { buildCollectionSummary } from "@/lib/settlement"
import { collectionStanding, type CollectionParticipant } from "@/lib/collection"
import { viewerIsAdmin } from "@/lib/admin-gate"

// The dashboard, after the book closes (Sprint 28 / #197).
//
// When tournaments.status flips to 'completed', app/dashboard/page.tsx EARLY
// RETURNS this instead of the betting console. That is the whole swap Pat asked
// for: "replace the pool total, entry, bets placed, place bets, house rules,
// alerts, how the pool works sections within the dashboard with a clear
// leaderboard ranking of who won the most money. Also clear out the countdown."
//
// Gone with the early return: the three StatCards, Place Bets, the alerts
// accordion, RulesCard, HowItWorksLauncher, and BOTH countdown branches —
// including the hardcoded "Opening ceremony" fallback, which is the one that
// would otherwise have survived, counting down to a date already in the past.
// Kept: the tournament heading, the activity feed, the ads.
//
// This page WRITES NO PAYOUT MATH. Every number comes from
// lib/payouts.ts:buildResultsTable(), which is Pat's formula and has been since
// Sprint 7; lib/standings.ts decides only the order. If a number here disagrees
// with lib/payouts.ts, this page is the bug.

export async function FinalStandings({
  tournamentRow,
  viewerUserId,
}: {
  /** The row app/dashboard/page.tsx already read, passed down rather than
   *  re-fetched — it carries the clock columns the activity feed needs. */
  tournamentRow: Record<string, unknown>
  viewerUserId: string | null
}) {
  const supabase = await createClient()
  const tournamentId = String(tournamentRow.id)
  const tournamentName = String(tournamentRow.name)

  const [
    { data: participantData, error: participantError },
    { data: payoutData, error: payoutError },
  ] = await Promise.all([
    supabase
      .from("tournament_participants")
      .select("user_id, entry_fee, users ( display_name, nickname, avatar_url )")
      .eq("tournament_id", tournamentId)
      // Revoked bettors leave the pool entirely — fee and wagers together
      // (Sprint 21 / #91; buildResultsTable drops their payout rows to match).
      .is("revoked_at", null),
    supabase
      .from("placement_payouts_view")
      .select(
        "placement_id, user_id, amount, result, theoretical_payout, refunded_stake"
      )
      .eq("tournament_id", tournamentId),
  ])

  // Neither of these was error-checked on /results, and on a page nobody had to
  // visit that was survivable. This is the front door now: a dropped payout
  // read renders a table of people who all won nothing, which is a confident
  // lie about money rather than an absence of data (#132). Both stop the page.
  if (participantError || payoutError) {
    console.error(
      "[final-standings] payout read failed:",
      participantError?.message ?? payoutError?.message
    )
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <LoadError subject="the final standings" />
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
    entry_fee: number
    users: UserJoin | UserJoin[] | null
  }
  const participants = ((participantData ?? []) as ParticipantRow[]).map((p) => {
    const joined = Array.isArray(p.users) ? p.users[0] : p.users
    return {
      user_id: p.user_id,
      display_name: joined?.display_name ?? "Unknown bettor",
      nickname: joined?.nickname ?? null,
      avatar_url: joined?.avatar_url ?? null,
      entry_fee: Number(p.entry_fee),
    }
  })
  const rows = normalizePayoutRows(
    (payoutData ?? []) as unknown as PayoutViewQueryRow[]
  )
  const table = buildResultsTable(participants, rows)
  // Pinned to profit/loss descending — Pat's ranking axis — and deliberately
  // NOT "whatever the viewer sorted to the top". See lib/standings.ts.
  const winner = standingsLeader(table.rows)

  // The feed keeps its phase events, which means keeping the bets read. Unlike
  // the live dashboard's — where the same read gates the betting badge and a
  // failure has to stop the page — there is no badge here to be wrong about, so
  // this one degrades to a quieter feed instead. Ambient colour beside the
  // money may not be a reason the money doesn't render.
  const { data: phaseBetsData, error: phaseBetsError } = await supabase
    .from("bets")
    .select("phase, status")
    .eq("tournament_id", tournamentId)
  if (phaseBetsError) {
    console.error(
      "[final-standings] phase bets read failed:",
      phaseBetsError.message
    )
  }
  const now = new Date()
  const activity = await loadActivityFeed(
    supabase,
    tournamentId,
    toPhaseClock(tournamentRow),
    (phaseBetsData ?? []) as FeedBet[],
    now
  )

  // Entry collection, for an admin only. THREE things about this read are
  // deliberate, and are ported verbatim from /results:
  //
  //   1. It is its OWN read rather than paid_amount added to the participants
  //      select above. That select is the page: a database that hasn't had the
  //      20260902 migration applied yet would fail it and every member would
  //      get an error card where the payouts should be — the exact shape of
  //      the Aug 31 outage. Here, the same failure costs the admin one block.
  //   2. It runs only for an admin, so a member's page does no extra work.
  //   3. `collection` stays null on any failure, which renders nothing. The
  //      block is a convenience beside the money; it may not become a reason
  //      the standings break.
  const isAdmin = await viewerIsAdmin(supabase)
  let collection = null
  if (isAdmin) {
    const { data: paidData, error: paidError } = await supabase
      .from("tournament_participants")
      .select("entry_fee, paid_amount, users ( display_name )")
      .eq("tournament_id", tournamentId)
      .is("revoked_at", null)
    if (paidError) {
      console.error("[final-standings] collection read failed:", paidError.message)
    } else {
      type PaidRow = {
        entry_fee: number | string | null
        paid_amount: number | string | null
        users: { display_name: string } | { display_name: string }[] | null
      }
      const forStanding: CollectionParticipant[] = (
        (paidData ?? []) as PaidRow[]
      ).map((p) => {
        const joined = Array.isArray(p.users) ? p.users[0] : p.users
        return {
          display_name: joined?.display_name ?? "Unknown bettor",
          entry_fee: Number(p.entry_fee) || 0,
          paid_amount: Number(p.paid_amount) || 0,
        }
      })
      collection = collectionStanding(forStanding)
    }
  }

  return (
    <div className="mx-auto grid max-w-[var(--container-max,1120px)] grid-cols-1 gap-4 px-4 py-6 lg:grid-cols-3 lg:gap-6">
      <div data-enter-stagger className="flex flex-col gap-4 lg:col-span-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl leading-tight text-text-strong">
              {tournamentName}
            </h1>
            <p className="mt-0.5 text-sm text-text-muted">
              Final pari-mutuel shares · no house, no rake
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Badge variant="neutral" uppercase>
              Final
            </Badge>
            <Badge variant="gold" uppercase>
              Pool ${table.pool}
            </Badge>
          </div>
        </div>

        {/* Provisional state (Sprint 25 / #108): the tournament was finalized
            while picks were still unresolved. aggregatePayouts SKIPS a pending
            placement rather than scoring it zero, so every share below is
            computed against a shrunken denominator and reads too high. Say so
            in those terms — "not final" undersells it — and suppress the winner
            spotlight, which is the screenshot that would travel. */}
        {table.pending > 0 && (
          <Card className="border-caution-border bg-caution-surface p-4 text-sm text-caution-strong">
            <span className="font-semibold">
              Provisional — {table.pending} wager
              {table.pending === 1 ? "" : "s"} still{" "}
              {table.pending === 1 ? "has" : "have"} no result.
            </span>{" "}
            Every share below is split across only the settled wagers, so the
            numbers read high. They settle once the last results are uploaded.
          </Card>
        )}

        {table.rows.length === 0 ? (
          <EmptyState
            title="No participants"
            message="Nobody was registered for this tournament."
          />
        ) : (
          <>
            {/* Winner spotlight — the screenshot people share, which is exactly
                why it waits for a settled table. Pinned to profit/loss
                descending: Pat's ranking axis is "who won the most money", and
                with entry fees varying that is not the same person as the
                biggest payout. */}
            {table.pending === 0 && winner && (
              // STACKED ON A PHONE, side by side from `sm` up. Side by side at
              // every width is what shipped, and at 390px the winner's name —
              // Azalea, 2xl, glyphs that overhang their box — ran straight into
              // the payout beside it. The name is the widest thing on this card
              // and the money is the second widest; there is no arrangement of
              // the two on one line at that width that isn't a collision.
              <div className="flex flex-col gap-3 rounded-xl bg-surface-inverse p-5 shadow-md sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold tracking-wider text-gold-300 uppercase">
                    Biggest Winner
                  </div>
                  {/* The face is INSIDE the link now. It used to sit beside the
                      chip as a bare <Avatar>, so the one element on the card
                      that most looks like a profile picture was the one part of
                      it you couldn't tap. */}
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
                    // `actual` here while the row shows actual + refunded would
                    // put two different numbers against one name on one screen.
                    value={cashReturned(winner)}
                    cents
                    size="xl"
                    className="text-gold-400"
                  />
                  <MoneyDisplay
                    value={winner.profit_loss}
                    cents
                    pl
                    onDark
                    size="sm"
                  />
                </div>
              </div>
            )}

            <h2 className="font-heading text-lg text-text-strong">
              Final Standings
            </h2>

            <StandingsTable
              rows={table.rows}
              pending={table.pending}
              leaderUserId={winner?.user_id ?? null}
              viewerUserId={viewerUserId}
            />

            {/* The member-facing "Send the payouts" copy block is GONE (Sept 8,
                2026). It existed to get the numbers to people when the numbers
                lived on /results, a page nobody had to visit; the standings are
                the dashboard now, so the group-thread paste was retelling ~32
                people what they were already looking at. lib/settlement.ts
                keeps buildSettlementSummary() and its tests — see the issue
                filed with this change.

                What survives is the ADMIN block below: it answers a different
                question ("who still owes"), it is gated on viewerIsAdmin(), and
                it was always a separate string for exactly that reason. */}
            {collection && (
              <SettlementSummary
                text={buildCollectionSummary(collection, tournamentName)}
                title="Entry collection (admins only)"
                hint="Who has handed their entry over. Nobody else sees this block, and none of it moves the pool — the split above already counts every entry."
              />
            )}

            <p className="text-center text-xs text-text-muted">
              Actual share = your theoretical payout ÷ everyone&apos;s
              theoretical × the ${table.pool} pool. Voided stakes were refunded,
              removed from the pool, and are included in the Payout above. No
              house, no rake — the pool pays itself out.
            </p>
          </>
        )}
      </div>

      {/* The weekend's memory, and the ads. No countdown: there is nothing left
          to count down to, and the fallback branch on the live dashboard counts
          to a fixed date that is now in the past. */}
      <aside className="flex flex-col gap-4 lg:col-span-1">
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg text-text-strong">Activity</h2>
          <ActivityFeed initialEvents={activity} serverNow={now.toISOString()} />
        </section>
        <AdCarousel ads={ads} className="mx-auto" />
      </aside>
    </div>
  )
}
