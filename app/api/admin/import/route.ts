import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  buildImportPlan,
  parseSheet,
  validateSheet,
  type ExistingBet,
  type ExistingPick,
} from "@/lib/import"

// Spreadsheet ingestion endpoint (ADR 0001 §7). Writes run under the admin's
// own session — the Sprint 1 RLS policies ("Admins can write bets/bet_picks")
// are the authorization; there is no service-role key in play.

const ACCEPTED_EXTENSIONS = [".xlsx", ".csv"]

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (!(profile as { is_admin: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 })
  }

  const name = file.name.toLowerCase()
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return NextResponse.json(
      { error: "Upload the bets spreadsheet as .xlsx or .csv." },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const { data: categoriesData, error: categoriesError } = await supabase
    .from("bet_categories")
    .select("id, name")
  if (categoriesError || !categoriesData || categoriesData.length === 0) {
    return NextResponse.json(
      { error: "Couldn't load bet categories." },
      { status: 500 }
    )
  }
  const categories = categoriesData as { id: string; name: string }[]

  let parsed
  try {
    parsed = await parseSheet(buffer, file.name)
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that file — is it a valid .xlsx or .csv?" },
      { status: 400 }
    )
  }

  // Contract errors reject the whole file — no partial imports (PRD §8.2).
  const validation = validateSheet(
    parsed,
    categories.map((c) => c.name)
  )
  if (!validation.ok) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 })
  }
  const rows = validation.rows

  const { data: tournamentData } = await supabase
    .from("tournaments")
    .select("id")
    .in("status", ["upcoming", "active"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!tournamentData) {
    return NextResponse.json(
      { error: "No upcoming or active tournament to import into." },
      { status: 400 }
    )
  }
  const tournamentId = (tournamentData as { id: string }).id

  const { data: existingBetsData, error: betsError } = await supabase
    .from("bets")
    .select(
      "id, sheet_bet_id, category_id, title, phase, round, status, total_probability"
    )
    .eq("tournament_id", tournamentId)
  if (betsError) {
    return NextResponse.json(
      { error: `Couldn't load existing bets: ${betsError.message}` },
      { status: 500 }
    )
  }
  const existingBets = (existingBetsData ?? []) as ExistingBet[]

  let existingPicks: ExistingPick[] = []
  if (existingBets.length > 0) {
    const { data: existingPicksData, error: picksError } = await supabase
      .from("bet_picks")
      .select(
        "id, bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability, result"
      )
      .in(
        "bet_id",
        existingBets.map((b) => b.id)
      )
    if (picksError) {
      return NextResponse.json(
        { error: `Couldn't load existing picks: ${picksError.message}` },
        { status: 500 }
      )
    }
    existingPicks = (existingPicksData ?? []) as ExistingPick[]
  }

  const plan = buildImportPlan(rows, existingBets, existingPicks, categories)

  // Apply. Not one transaction (PostgREST doesn't span calls), but the
  // contract check above rejected bad files before any write, and the
  // sheet-key upsert is idempotent — re-uploading heals a mid-write failure.
  const betIdBySheetId = new Map(
    existingBets.map((b) => [b.sheet_bet_id, b.id])
  )

  if (plan.bets.create.length > 0) {
    const { data: created, error } = await supabase
      .from("bets")
      .insert(
        plan.bets.create.map((b) => ({ ...b, tournament_id: tournamentId }))
      )
      .select("id, sheet_bet_id")
    if (error) {
      return NextResponse.json(
        { error: `Creating bets failed: ${error.message}` },
        { status: 500 }
      )
    }
    for (const b of (created ?? []) as { id: string; sheet_bet_id: number }[]) {
      betIdBySheetId.set(b.sheet_bet_id, b.id)
    }
  }

  for (const bet of plan.bets.update) {
    const { id, ...fields } = bet
    const { error } = await supabase.from("bets").update(fields).eq("id", id)
    if (error) {
      return NextResponse.json(
        { error: `Updating bet ${bet.sheet_bet_id} failed: ${error.message}` },
        { status: 500 }
      )
    }
  }

  if (plan.picks.create.length > 0) {
    const { error } = await supabase.from("bet_picks").insert(
      plan.picks.create.map(({ sheet_bet_id, ...pick }) => ({
        ...pick,
        bet_id: betIdBySheetId.get(sheet_bet_id)!,
      }))
    )
    if (error) {
      return NextResponse.json(
        { error: `Creating picks failed: ${error.message}` },
        { status: 500 }
      )
    }
  }

  for (const pick of plan.picks.update) {
    const { id, sheet_bet_id, ...fields } = pick
    const { error } = await supabase
      .from("bet_picks")
      .update({ ...fields, bet_id: betIdBySheetId.get(sheet_bet_id)! })
      .eq("id", id)
    if (error) {
      return NextResponse.json(
        {
          error: `Updating pick ${pick.sheet_pick_id} failed: ${error.message}`,
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    message:
      `Bets: ${plan.bets.create.length} created, ${plan.bets.update.length} updated, ` +
      `${plan.bets.unchanged} unchanged. Picks: ${plan.picks.create.length} created, ` +
      `${plan.picks.update.length} updated, ${plan.picks.unchanged} unchanged.`,
  })
}
