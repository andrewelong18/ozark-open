import { NextResponse } from "next/server"
import { requireAdminRoute } from "@/lib/admin-gate"
import {
  buildImportPlan,
  clockStaleOpenWarnings,
  parseSheet,
  validateSheet,
  type ExistingBet,
  type ExistingPick,
} from "@/lib/import"
import { toPhaseClock, TOURNAMENT_CLOCK_COLUMNS } from "@/lib/placements"
import { takeSnapshot } from "@/lib/snapshots"

// Spreadsheet ingestion endpoint (ADR 0001 §7). Writes run under the admin's
// own session — the Sprint 1 RLS policies ("Admins can write bets/bet_picks")
// are the authorization; there is no service-role key in play.

const ACCEPTED_EXTENSIONS = [".xlsx", ".csv"]

export async function POST(request: Request) {
  const gate = await requireAdminRoute()
  if (gate.error) return gate.error
  const { supabase } = gate

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

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    // The clock columns ride along so the stale-open warning can compare the
    // sheet against the phase deadlines, not just against itself (#122).
    .select(`id, ${TOURNAMENT_CLOCK_COLUMNS}`)
    .in("status", ["upcoming", "active"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  // "No tournament to import into" is a real, actionable state; a failed read
  // is not, and must not be reported as one (#132).
  if (tournamentError) {
    return NextResponse.json(
      { error: `Couldn't load the target tournament: ${tournamentError.message}` },
      { status: 500 }
    )
  }
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
        "id, bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability, player_user_id, result"
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

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("id, display_name")
  if (usersError) {
    return NextResponse.json(
      { error: `Couldn't load users for name-matching: ${usersError.message}` },
      { status: 500 }
    )
  }
  const users = (usersData ?? []) as { id: string; display_name: string }[]

  const plan = buildImportPlan(
    rows,
    existingBets,
    existingPicks,
    categories,
    users
  )

  // Save state, before a single row moves (Sprint 11). The upload is the
  // riskiest moment in the tournament: it is the one operation that rewrites
  // the whole menu, it happens four times over a weekend, often on a phone at a
  // tee box, and an upload of the wrong sheet looks exactly like an upload of
  // the right one until someone reads the report.
  //
  // Deliberately placed AFTER the contract check and BEFORE the first write, so
  // a rejected file doesn't accrue a pointless snapshot, and an accepted one
  // can always be undone.
  //
  // A snapshot failure ABORTS the import. Reasonable people could argue for
  // carrying on with a warning — but the entire value of a net is that it is
  // there before the risk is taken, and an admin who has just been told
  // "imported" will not go back and check whether the backup half worked.
  // Nothing has been written at this point, so failing here is free.
  const snapshot = await takeSnapshot(supabase, "pre-import")
  if (!snapshot.ok) {
    return NextResponse.json(
      {
        error:
          `Couldn't take a pre-import snapshot, so nothing was imported: ` +
          `${snapshot.message}`,
      },
      { status: 500 }
    )
  }

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

  // Odds-changed-with-live-placements warning. Harmless for payouts —
  // placements snapshot odds at write time (PRD §7.1) — but the admin should
  // know. Warning only; the upload has already been applied above. A lookup
  // failure still degrades to no warning rather than failing the import —
  // that part was right — but it now SAYS so instead of going quiet (#132).
  // "Nobody had bet on these" and "we couldn't check" are different facts,
  // and only one of them means the admin can stop worrying.
  const pickIdsWithPlacements = new Set<number>()
  let placementLookupFailed: string | null = null
  if (plan.oddsChanges.length > 0) {
    const sheetIdByUuid = new Map(
      existingPicks.map((p) => [p.id, p.sheet_pick_id])
    )
    const changedUuids = existingPicks
      .filter((p) =>
        plan.oddsChanges.some((c) => c.sheetPickId === p.sheet_pick_id)
      )
      .map((p) => p.id)
    const { data: livePlacements, error: livePlacementsError } = await supabase
      .from("bet_placements")
      .select("pick_id")
      .in("pick_id", changedUuids)
      .is("deleted_at", null)
    if (livePlacementsError) {
      placementLookupFailed = livePlacementsError.message
    }
    for (const row of (livePlacements ?? []) as { pick_id: string }[]) {
      const sheetPickId = sheetIdByUuid.get(row.pick_id)
      if (sheetPickId !== undefined) pickIdsWithPlacements.add(sheetPickId)
    }
  }
  const warnings = [
    // Sheet-level warnings from the contract pass (stale-open bets, #97) —
    // non-blocking by design, reported the same way as the odds change below.
    ...validation.warnings,
    // The same concern, checked against the phase clock rather than against
    // the sheet's own shape (#122) — catches a whole phase left open after
    // its deadline, which reads as self-consistent to the contract pass.
    ...clockStaleOpenWarnings(
      rows,
      toPhaseClock(tournamentData as unknown as Record<string, unknown>),
      new Date()
    ),
    ...plan.oddsChanges
      .filter((change) => pickIdsWithPlacements.has(change.sheetPickId))
      .map(
        (change) =>
          `Odds changed on "${change.pickLabel}" (${change.betTitle}) while it has live placements: ` +
          `${change.from.fractionalOdds} → ${change.to.fractionalOdds}. Existing placements keep ` +
          `their snapshotted odds; only future placements get the new price.`
      ),
    ...(placementLookupFailed
      ? [
          `Couldn't check whether the odds-changed picks already have wagers on them: ` +
            `${placementLookupFailed}. The import applied fine — but if any of those picks ` +
            `were already bet, this report didn't tell you.`,
        ]
      : []),
  ]

  return NextResponse.json({
    report: {
      bets: {
        created: plan.bets.create.length,
        updated: plan.bets.update.length,
        unchanged: plan.bets.unchanged,
      },
      picks: {
        created: plan.picks.create.length,
        updated: plan.picks.update.length,
        unchanged: plan.picks.unchanged,
      },
      unmatchedPickNames: plan.unmatchedPickNames,
      warnings,
      // The undo button for the upload just applied. Surfaced in the report
      // because this is the one moment an admin knows they might want it.
      snapshotId: snapshot.id,
    },
  })
}
