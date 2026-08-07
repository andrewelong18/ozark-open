import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/avatar"
import { PlayerChip } from "@/components/player/player-chip"
import { EmptyState } from "@/components/modules/empty-state"
import { MoneyDisplay } from "@/components/betting/money-display"
import {
  buildResultsTable,
  normalizePayoutRows,
  type PayoutViewQueryRow,
} from "@/lib/payouts"

// Final standings (Sprint 7): each participant's entry, theoretical payout,
// actual pari-mutuel share, and profit/loss — to the cent (Q5). Visible only
// once tournament.status = 'completed' (flipped in Studio when Saturday's
// results are in); before that the page shows a friendly gate, and the nav
// doesn't link here at all. Theoretical numbers come from
// placement_payouts_view (all bets are closed by now, so RLS lets every
// participant read every row); the proportional split runs in lib/payouts.ts.

export default async function ResultsPage() {
  const supabase = await createClient()

  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select("id, name, status")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

  const tournament = tournamentData as {
    id: string
    name: string
    status: string
  } | null

  if (!tournament || tournament.status !== "completed") {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState
          glyph="⛳"
          title="No results yet"
          message="Final payouts appear here once the tournament wraps and the last results are in."
        />
      </div>
    )
  }

  const [{ data: participantData }, { data: payoutData }] = await Promise.all([
    supabase
      .from("tournament_participants")
      .select("user_id, entry_fee, users ( display_name, nickname, avatar_url )")
      .eq("tournament_id", tournament.id)
      // Revoked bettors leave the pool entirely — fee and wagers together
      // (Sprint 21 / #91; buildResultsTable drops their payout rows to match).
      .is("revoked_at", null),
    supabase
      .from("placement_payouts_view")
      .select(
        "placement_id, user_id, amount, result, theoretical_payout, refunded_stake"
      )
      .eq("tournament_id", tournament.id),
  ])

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
  const participants = ((participantData ?? []) as ParticipantRow[]).map(
    (p) => {
      const joined = Array.isArray(p.users) ? p.users[0] : p.users
      return {
        user_id: p.user_id,
        display_name: joined?.display_name ?? "Unknown bettor",
        nickname: joined?.nickname ?? null,
        avatar_url: joined?.avatar_url ?? null,
        entry_fee: Number(p.entry_fee),
      }
    }
  )
  const rows = normalizePayoutRows(
    (payoutData ?? []) as unknown as PayoutViewQueryRow[]
  )
  const table = buildResultsTable(participants, rows)
  const winner = table.rows[0]

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl leading-tight text-text-strong">
            Results
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {tournament.name} · final pari-mutuel shares
          </p>
        </div>
        <Badge variant="gold" uppercase>
          Pool ${table.pool}
        </Badge>
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
            Provisional — {table.pending} wager{table.pending === 1 ? "" : "s"}{" "}
            still {table.pending === 1 ? "has" : "have"} no result.
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
              why it waits for a settled table. */}
          {table.pending === 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-inverse p-5 shadow-md">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={winner.avatar_url} name={winner.display_name} size="md" />
              <div className="min-w-0">
                <div className="text-[11px] font-bold tracking-wider uppercase text-gold-300">
                  Top Payout
                </div>
                <div className="mt-0.5">
                  <PlayerChip
                    userId={winner.user_id}
                    displayName={winner.display_name}
                    nickname={winner.nickname}
                    hideAvatar
                    tone="onDark"
                    nameClassName="font-heading text-2xl leading-tight text-white"
                    nicknameClassName="text-gold-300"
                  />
                </div>
              </div>
            </div>
            <div className="text-right">
              <MoneyDisplay
                value={winner.actual}
                cents
                size="xl"
                className="text-gold-400"
              />
              <div className="mt-0.5">
                <MoneyDisplay
                  value={winner.profit_loss}
                  cents
                  pl
                  onDark
                  size="sm"
                />
              </div>
            </div>
          </div>
          )}

          <Card className="gap-0 overflow-x-auto p-0">
            <div className="min-w-[480px]">
              <div className="grid grid-cols-[24px_1fr_repeat(4,68px)] gap-2 border-b border-border px-4 py-2.5 text-[10px] font-bold tracking-wider uppercase text-text-muted">
                <span>#</span>
                <span>Player</span>
                <span className="text-right">Entry</span>
                <span className="text-right">Theo</span>
                <span className="text-right">Payout</span>
                <span className="text-right">P/L</span>
              </div>
              {table.rows.map((row, i) => (
                <div
                  key={row.user_id}
                  className={
                    "grid grid-cols-[24px_1fr_repeat(4,68px)] items-center gap-2 border-t border-border px-4 py-3 first:border-t-0" +
                    // Gold on the leader is a verdict too — hold it until the
                    // ordering is settled rather than provisional (#108).
                    (i === 0 && table.pending === 0 ? " bg-gold-100" : "")
                  }
                >
                  <span
                    className={
                      "tabular text-sm font-bold " +
                      (i === 0 ? "text-gold-700" : "text-text-muted")
                    }
                  >
                    {i + 1}
                  </span>
                  <PlayerChip
                    userId={row.user_id}
                    displayName={row.display_name}
                    nickname={row.nickname}
                    avatarUrl={row.avatar_url}
                    className="min-w-0"
                    nameClassName="text-sm font-semibold text-text-strong"
                  >
                    {row.refunded > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-text-muted">
                        (${row.refunded} refunded)
                      </span>
                    )}
                  </PlayerChip>
                  <span className="text-right">
                    <MoneyDisplay
                      value={row.entry_fee}
                      size="sm"
                      weight="regular"
                      className="text-text-muted"
                    />
                  </span>
                  <span className="text-right">
                    <MoneyDisplay
                      value={row.theoretical}
                      cents
                      size="sm"
                      weight="regular"
                      className="text-text-body"
                    />
                  </span>
                  <span className="text-right">
                    <MoneyDisplay value={row.actual} cents size="sm" weight="bold" />
                  </span>
                  <span className="text-right">
                    <MoneyDisplay
                      value={row.profit_loss}
                      cents
                      pl
                      size="sm"
                      weight="semibold"
                    />
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <p className="text-center text-xs text-text-muted">
            Actual share = your theoretical payout ÷ everyone&apos;s theoretical
            × the ${table.pool} pool. Voided stakes were refunded and removed
            from the pool. No house, no rake — the pool pays itself out.
          </p>
        </>
      )}
    </div>
  )
}
