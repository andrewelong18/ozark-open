import { NextResponse } from "next/server"
import { requireAdminRoute as requireAdmin } from "@/lib/admin-gate"
import { createClient } from "@/lib/supabase/server"
import { parseRulesBody, validateTournamentRules } from "@/lib/rules"

// House-rules editor (Sprint 23 / #100) — PATCH the eight rule parameters on
// the tournaments row. Modelled on app/api/admin/close/route.ts, which already
// owns the other half of that row (the phase clock).
//
// Rule parameters have always lived on the tournaments row and reached
// validation through toTournamentRules() — CLAUDE.md's no-hardcoded-figures
// rule held — so this is a form over an existing row, not a refactor. The
// values are re-validated here because a client check is UX, not security.
//
// What this route does NOT do: touch placed wagers. Changing a rule never
// retroactively invalidates one — whatever stands, stands (PRD §12 Q3). A
// lowered cap binds the NEXT placement only. The page says so out loud.
//
// Writes are admin-only at the DB too ("Admins can write tournaments", RLS);
// the gate here is for clean 401/403s rather than security.

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function activeTournament(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data } = await supabase
    .from("tournaments")
    .select("id")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as { id: string } | null
}

export async function PATCH(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const parsed = parseRulesBody(await readJson(request))
  if (!parsed.ok) {
    return NextResponse.json({ errors: [parsed.error] }, { status: 400 })
  }

  const errors = validateTournamentRules(parsed.value)
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 })
  }

  const tournament = await activeTournament(supabase)
  if (!tournament) {
    return NextResponse.json({ error: "No tournament to edit." }, { status: 400 })
  }

  const { error } = await supabase
    .from("tournaments")
    .update(parsed.value)
    .eq("id", tournament.id)
  if (error) {
    return NextResponse.json(
      { error: `Saving the rules failed: ${error.message}` },
      { status: 500 }
    )
  }
  return NextResponse.json({ rules: parsed.value })
}
