import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/modules/stat-card"
import { EmptyState } from "@/components/modules/empty-state"
import { MoneyDisplay } from "@/components/betting/money-display"
import { OddsChip } from "@/components/betting/odds-chip"
import { OutcomeBadge } from "@/components/betting/outcome-badge"
import { StatusBadge } from "@/components/betting/status-badge"
import {
  buildAdminView,
  normalizeAdminRows,
  type AdminViewQueryRow,
} from "@/lib/admin-view"

// The admin "view all" page (Sprint 7): everyone's placements and payouts in
// one table, still-open phases included — the app's replica of the workbook's
// `View` sheet. Admin-only via the same 404 gate as /admin/import; RLS
// already lets admins read every placement, but the page must not exist for
// anyone else. The numbers come from lib/admin-view.ts → lib/payouts.ts, the
// same math /results uses, so the two can never disagree.

const ROUND_LABEL: Record<string, string> = {
  tournament: "Tournament",
  round_1: "Round 1",
  round_2: "Round 2",
  round_3: "Round 3",
}

type ParticipantRow = {
  user_id: string
  entry_fee: number
  users: { display_name: string } | { display_name: string }[] | null
}

export default async function AdminViewPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (!(profile as { is_admin: boolean } | null)?.is_admin) notFound()

  // Latest tournament regardless of status — this page serves the whole
  // lifecycle, from chasing stragglers to reading final numbers.
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tournament) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState
          title="No tournament"
          message="Seed a tournament row before there's anything to view."
        />
      </div>
    )
  }
  const t = tournament as { id: string; name: string; status: string }

  const [{ data: participantData }, { data: placementData }] =
    await Promise.all([
      supabase
        .from("tournament_participants")
        .select("user_id, entry_fee, users ( display_name )")
        .eq("tournament_id", t.id),
      supabase
        .from("bet_placements")
        .select(
          "id, user_id, pick_id, amount, odds_at_placement, requires_admin_review, users ( display_name ), bet_picks ( label, sheet_pick_id, result, bets ( title, phase, round, status, sheet_bet_id, tournament_id ) )"
        )
        .is("deleted_at", null),
    ])

  const participants = ((participantData ?? []) as ParticipantRow[]).map(
    (p) => {
      const joined = Array.isArray(p.users) ? p.users[0] : p.users
      return {
        user_id: p.user_id,
        display_name: joined?.display_name ?? "Unknown bettor",
        entry_fee: Number(p.entry_fee),
      }
    }
  )
  const rows = normalizeAdminRows(
    (placementData ?? []) as unknown as AdminViewQueryRow[],
    t.id
  )
  const view = buildAdminView(participants, rows)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          View All
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {t.name} · every placement, every bettor — open phases included
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Pool"
          value={view.pool}
          money
          feature
          caption="Entry fees − voided stakes"
        />
        <StatCard
          label="Sum Theoretical"
          value={view.sum_theoretical}
          money
          cents
          caption={
            view.pending > 0
              ? `${view.pending} pick${view.pending === 1 ? "" : "s"} still pending`
              : "All picks resolved"
          }
        />
      </div>

      {view.bettors.length === 0 ? (
        <EmptyState
          title="No participants yet"
          message="Add participants in Supabase Studio and their placements will show here."
        />
      ) : (
        view.bettors.map((bettor) => (
          <section key={bettor.user_id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="font-heading text-2xl text-indigo-700">
                {bettor.display_name}
                {bettor.flagged > 0 && (
                  <Badge variant="amber" className="ml-2 align-middle">
                    {bettor.flagged} self-pick
                  </Badge>
                )}
              </h2>
              <span className="tabular text-xs text-text-muted">
                Wagered{" "}
                <MoneyDisplay
                  value={bettor.wagered}
                  size="xs"
                  weight="semibold"
                  className="text-inherit"
                />{" "}
                of ${bettor.entry_fee} · Theo{" "}
                <MoneyDisplay
                  value={bettor.theoretical}
                  cents
                  size="xs"
                  weight="semibold"
                  className="text-inherit"
                />{" "}
                · Actual{" "}
                <MoneyDisplay
                  value={bettor.actual}
                  cents
                  size="xs"
                  weight="semibold"
                  className="text-inherit"
                />
                {bettor.refunded > 0 && (
                  <>
                    {" "}
                    · Refunded{" "}
                    <MoneyDisplay
                      value={bettor.refunded}
                      size="xs"
                      weight="semibold"
                      className="text-inherit"
                    />
                  </>
                )}
              </span>
            </div>
            {bettor.entries.length === 0 ? (
              <Card className="p-4 text-sm text-text-muted">
                No placements yet.
              </Card>
            ) : (
              <Card className="gap-0 p-0">
                {bettor.entries.map((entry) => (
                  <div
                    key={entry.placement_id}
                    className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] leading-snug font-semibold text-text-strong">
                          {entry.pick_label}
                        </span>
                        {entry.requires_admin_review && (
                          <Badge variant="amber">Self-pick</Badge>
                        )}
                        {entry.bet_status === "open" && (
                          <StatusBadge status="open" />
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-text-muted">
                        Phase {entry.phase} ·{" "}
                        {ROUND_LABEL[entry.round] ?? entry.round} ·{" "}
                        {entry.bet_title}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-2.5">
                        <OddsChip odds={entry.odds_at_placement} size="sm" />
                        <MoneyDisplay
                          value={entry.amount}
                          size="sm"
                          weight="bold"
                        />
                      </div>
                      {entry.result !== "pending" && (
                        <div className="flex items-center gap-2">
                          <OutcomeBadge outcome={entry.result} size="sm" />
                          {entry.result === "void" ? (
                            <span className="text-xs text-text-muted">
                              <MoneyDisplay
                                value={entry.refunded}
                                size="xs"
                                weight="semibold"
                                className="text-inherit"
                              />{" "}
                              refunded
                            </span>
                          ) : (
                            <MoneyDisplay
                              value={entry.theoretical ?? 0}
                              cents
                              size="sm"
                              weight="bold"
                              className={
                                entry.result === "hit"
                                  ? "text-money-up"
                                  : "text-text-body"
                              }
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </section>
        ))
      )}

      <p className="text-center text-xs text-text-muted">
        Actual = theoretical ÷ everyone&apos;s theoretical × the pool. Numbers
        are as-they-stand until every pick resolves.
      </p>
    </div>
  )
}
