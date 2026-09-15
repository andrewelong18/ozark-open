import { requireAdminPage } from "@/lib/admin-gate"
import { AdminBackLink } from "@/components/admin/admin-back-link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/modules/stat-card"
import { EmptyState } from "@/components/modules/empty-state"
import { LoadError } from "@/components/modules/load-error"
import { MoneyDisplay } from "@/components/betting/money-display"
import { OddsChip } from "@/components/betting/odds-chip"
import { OutcomeBadge } from "@/components/betting/outcome-badge"
import { StatusBadge } from "@/components/betting/status-badge"
import { Avatar } from "@/components/avatar"
import { UserName } from "@/components/user-name"
import {
  buildAdminView,
  normalizeAdminRows,
  type AdminViewQueryRow,
} from "@/lib/admin-view"
import type { ResultsParticipant } from "@/lib/payouts"
import { toPhaseEntry, toTournamentRules, TOURNAMENT_RULE_COLUMNS } from "@/lib/placements"

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

export default async function AdminViewPage() {
  const { supabase } = await requireAdminPage()

  // Latest tournament regardless of status — this page serves the whole
  // lifecycle, from chasing stragglers to reading final numbers.
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, name, status, ${TOURNAMENT_RULE_COLUMNS}`)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()

  // This page is the admin's replica of the View sheet — its whole job is to
  // be trusted as a faithful read of the database (#132).
  if (tournamentError) {
    console.error("[admin/view] tournament read failed:", tournamentError.message)
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <LoadError subject="the tournament" />
      </div>
    )
  }

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
  const rules = toTournamentRules(tournament as unknown as Record<string, unknown>)

  const [{ data: participantData }, { data: placementData }] =
    await Promise.all([
      supabase
        .from("tournament_participants")
        .select(
          "user_id, phase1_entry_fee, phase2_entry_fee, is_player, users ( display_name, nickname, avatar_url )"
        )
        .eq("tournament_id", t.id)
        .is("revoked_at", null),
      supabase
        .from("bet_placements")
        .select(
          // The embed must name the FK — placed_by_user_id (Sprint 23) is a
          // second bet_placements → users relationship, so a bare `users` is
          // ambiguous and PostgREST rejects the request (PGRST201). This is the
          // bettor's row, never the admin who typed it in.
          // `player_user_id` on the pick: the live fact the self-bet share is
          // computed from (Sprint 30), beside the snapshotted review flag.
          "id, user_id, pick_id, amount, odds_at_placement, requires_admin_review, placed_by_user_id, users!bet_placements_user_id_fkey ( display_name, nickname, avatar_url ), bet_picks ( label, sheet_pick_id, result, player_user_id, bets ( title, phase, round, status, sheet_bet_id, tournament_id ) )"
        )
        .is("deleted_at", null),
    ])

  const participants: ResultsParticipant[] = (
    (participantData ?? []) as ParticipantRow[]
  ).map((p) => {
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
  })
  const rows = normalizeAdminRows(
    (placementData ?? []) as unknown as AdminViewQueryRow[],
    t.id
  )
  const view = buildAdminView(participants, rows, rules)

  // Who entered each wager (Sprint 23 / #101). Resolved with a second small
  // query rather than a second embed of `users`: PostgREST needs the FK
  // constraint name to disambiguate two joins to the same table, and coupling
  // this page to a generated constraint name isn't worth saving a round trip
  // over ~32 people. Empty in the normal case, where nobody bet on anyone's
  // behalf.
  const placerIds = [
    ...new Set(rows.map((r) => r.placed_by_user_id).filter((id): id is string => id !== null)),
  ]
  let placerNames: Record<string, string> = {}
  if (placerIds.length > 0) {
    const { data: placerData, error: placerError } = await supabase
      .from("users")
      .select("id, display_name")
      .in("id", placerIds)
    // Names only. A failure degrades to the fallback the map already has for
    // an unmatched id, so it logs and carries on rather than blanking a page
    // the admin may be reading mid-close.
    if (placerError) {
      console.error("[admin/view] placer-name read failed:", placerError.message)
    }
    placerNames = Object.fromEntries(
      ((placerData ?? []) as { id: string; display_name: string }[]).map((u) => [
        u.id,
        u.display_name,
      ])
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <AdminBackLink />
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          View All
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {t.name} · every placement, every bettor — open phases included
        </p>
      </div>

      {/* One pot per phase (Sprint 30 / ADR 0002): committed entries minus
          voided stakes, each split on its own. The combined figure is the
          two added together, never a merged split. */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Phase 1 Pool"
          value={view.pools[1]}
          money
          cents={!Number.isInteger(view.pools[1])}
          feature
          caption="Committed entries − voided stakes"
        />
        <StatCard
          label="Phase 2 Pool"
          value={view.pools[2]}
          money
          cents={!Number.isInteger(view.pools[2])}
          feature
          caption="Committed entries − voided stakes"
        />
        <StatCard
          label="Both Pots"
          value={view.pools.combined}
          money
          cents={!Number.isInteger(view.pools.combined)}
          caption={
            view.dropped_placements > 0
              ? `${view.dropped_placements} placement${view.dropped_placements === 1 ? "" : "s"} outside any pot`
              : "Phase 1 + Phase 2"
          }
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

      {/* Placements with no pot to belong to — a bettor with no entry for
          that phase, or a revoked one. Never member-facing; it means a hand
          edit somewhere, and it's money that the standings are ignoring. */}
      {view.dropped_placements > 0 && (
        <Card className="border-caution-border bg-caution-surface p-4 text-sm text-caution-strong">
          <span className="font-semibold">
            {view.dropped_placements} placement
            {view.dropped_placements === 1 ? " is" : "s are"} outside any pot.
          </span>{" "}
          A wager in a phase the bettor has no entry for, or from a revoked
          member — the standings leave it out. Record the entry on the people
          console or remove the wager.
        </Card>
      )}

      {/* Approved, no money in either phase: they can't bet, and if they've
          requested an entry it's waiting on the people console. */}
      {view.unentered.length > 0 && (
        <Card className="p-4 text-sm text-text-body">
          <span className="font-semibold text-text-strong">
            No entry yet ({view.unentered.length}):
          </span>{" "}
          {view.unentered.map((p) => p.display_name).join(", ")}
        </Card>
      )}

      {view.bettors.length === 0 ? (
        <EmptyState
          title="No participants yet"
          message="Add participants in Supabase Studio and their placements will show here."
        />
      ) : (
        view.bettors.map((bettor, i) => (
          // One cascade step per bettor section. The stagger cap means a full
          // 32-person field still settles in well under a second.
          <section
            key={bettor.user_id}
            style={{ "--index": i } as React.CSSProperties}
            className="flex flex-col gap-2 motion-safe:animate-rise-in motion-safe:stagger"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              {/* min-w-0 + wrap: an avatar, a long display name and a
                  self-pick badge on one 24px line pushed the row past the
                  viewport on a phone. */}
              <h2 className="flex min-w-0 flex-wrap items-center gap-2 font-heading text-xl text-indigo-700 sm:text-2xl">
                <Avatar
                  src={bettor.avatar_url}
                  name={bettor.display_name}
                  size="sm"
                />
                <UserName
                  displayName={bettor.display_name}
                  nickname={bettor.nickname}
                />
                {bettor.flagged > 0 && (
                  <Badge variant="amber" className="align-middle">
                    {bettor.flagged} self-pick
                  </Badge>
                )}
              </h2>
              <span className="tabular text-xs text-text-muted">
                Theo{" "}
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
                {bettor.refunded + bettor.refund_unwagered > 0 && (
                  <>
                    {" "}
                    · Refunded{" "}
                    <MoneyDisplay
                      value={bettor.refunded + bettor.refund_unwagered}
                      cents
                      size="xs"
                      weight="semibold"
                      className="text-inherit"
                    />
                  </>
                )}
              </span>
            </div>
            {/* One line per phase they're in: wagered against that phase's
                entry, the pick count, and what the standing says the money
                does at close. `over entry` is only reachable by a hand edit
                (the trigger refuses it), so it's badged rather than styled. */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              {bettor.phases.map((line) => (
                <span key={line.phase} className="tabular">
                  <span className="font-semibold text-text-body">Phase {line.phase}</span>{" "}
                  ${line.wagered} of ${line.entry} · {line.pick_count} pick
                  {line.pick_count === 1 ? "" : "s"}
                  {line.forfeit > 0 && ` · $${line.forfeit} forfeits`}
                  {line.refund > 0 && ` · $${line.refund} back`}
                  {line.self_forfeit > 0 && ` · $${line.self_forfeit} on self not counted`}
                  {line.complete && " · ✓"}
                  {line.over_entry && (
                    <Badge variant="amber" className="ml-1.5 align-middle">
                      over entry
                    </Badge>
                  )}
                </span>
              ))}
              {bettor.phases.length < 2 && (
                <span>
                  Phase {bettor.phases.some((l) => l.phase === 1) ? 2 : 1} · not entered
                </span>
              )}
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
                        {/* Not decoration: every row here is money, and a
                            September dispute has to be reconstructable. */}
                        {entry.placed_by_user_id && (
                          <Badge variant="indigo">
                            Entered by{" "}
                            {placerNames[entry.placed_by_user_id] ?? "an admin"}
                          </Badge>
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
        Per phase: actual = recognised theoretical ÷ everyone&apos;s × that
        phase&apos;s pool; a bettor&apos;s row is their two phases added. Numbers
        are as-they-stand until every pick resolves.
      </p>
    </div>
  )
}
