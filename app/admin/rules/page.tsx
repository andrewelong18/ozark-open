import { notFound } from "next/navigation"
import { requireAdminPage } from "@/lib/admin-gate"
import { RulesForm } from "@/components/admin/rules-form"
import { toTournamentRules, TOURNAMENT_RULE_COLUMNS } from "@/lib/placements"

// /admin/rules (Sprint 23 / #100) — the house rules, editable from the app.
//
// Every rule parameter already lived on the tournaments row and reached
// validation through toTournamentRules(), so this page is a form over an
// existing row. Before it, changing a house rule meant Supabase Studio, i.e.
// database access, which is the wall Pat hit in the Jul 31 dry run.
//
// Non-admins get a 404, same pattern as /admin/import.

export default async function AdminRulesPage() {
  const { supabase } = await requireAdminPage()

  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select(`id, name, ${TOURNAMENT_RULE_COLUMNS}`)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!tournamentData) notFound()

  const tournament = tournamentData as unknown as { name: string }
  const rules = toTournamentRules(
    tournamentData as unknown as Record<string, unknown>
  )

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          House Rules
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {tournament.name} · the money rules every wager is checked against
        </p>
      </div>

      <RulesForm rules={rules} />

      <p className="text-center text-xs text-text-muted">
        These eight values live on the tournament row and are read fresh on
        every placement — nothing in the app hardcodes a dollar figure or a
        pick count.
      </p>
    </div>
  )
}
