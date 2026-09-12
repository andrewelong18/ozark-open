import { NextResponse } from "next/server"
import { requireAdminRoute } from "@/lib/admin-gate"
import {
  buildImportPlan,
  unlandedWrite,
  clockStaleOpenWarnings,
  parseSheet,
  planSweep,
  sweepIsEmpty,
  validateSheet,
  type ExistingBet,
  type ExistingPick,
  type PlacementRef,
} from "@/lib/import"
import { CATEGORIES } from "@/lib/bet-taxonomy"
import { toPhaseClock, TOURNAMENT_CLOCK_COLUMNS } from "@/lib/placements"
import { finalizeReadiness } from "@/lib/payouts"
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
  // The sweep's two-pass handshake (Sprint 29). Absent on the first upload:
  // the route answers 409 with what it would delete and writes nothing. Present
  // on the second, where "false" is the "Import without deleting" escape — the
  // purely additive behaviour every upload had before this sprint.
  const confirmSweep = formData.get("confirm_sweep")
  const sweepConfirmed = confirmSweep === "true"
  const clearWagered = formData.get("clear_wagered") === "true"
  const sentFingerprint = formData.get("sweep_fingerprint")

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

  // `bet_categories` supplies the IDS that `bets.category_id` points at — it is
  // no longer the authority on which category NAMES are legal. That moved into
  // lib/bet-taxonomy.ts on Sept 10 2026, because the table has no CHECK
  // constraint and a stray row in it was enough to make an off-contract
  // category importable and then render it as a filter chip ("Medalist is not a
  // bet category" — Pat). A stray extra row here is now inert; a MISSING one is
  // a misconfigured database and stops the import cold rather than failing later
  // on a `category_id` that resolved to undefined.
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
  const missingCategories = CATEGORIES.filter(
    (name) => !categories.some((c) => c.name === name)
  )
  if (missingCategories.length > 0) {
    return NextResponse.json(
      {
        error: `Bet categories are misconfigured — the database is missing: ${missingCategories.join(", ")}. Nothing was imported.`,
      },
      { status: 500 }
    )
  }

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
  const validation = validateSheet(parsed)
  if (!validation.ok) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 })
  }
  const rows = validation.rows

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    // The clock columns ride along so the stale-open warning can compare the
    // sheet against the phase deadlines, not just against itself (#122).
    .select(`id, ${TOURNAMENT_CLOCK_COLUMNS}`)
    // DELIBERATELY not widened to 'completed' when the dashboard swap was
    // (Sprint 28 / #197). Every other tournament read in the app took
    // 'completed' so the app keeps working after the book closes; this one
    // must not, because importing into a settled tournament would rewrite
    // results the payouts have already been split from. Unpost first.
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

  // ---------------------------------------------------------------------
  // The sweep: rows the sheet no longer lists (Sprint 29)
  //
  // EVERY placement on every existing pick, soft-deleted included, because
  // deleted_at is a column and not a row removal — the foreign key still
  // holds, so a "live placements only" read here would build a delete set the
  // database then refuses (lib/import.ts, planSweep rule 2).
  // ---------------------------------------------------------------------
  let placementRefs: PlacementRef[] = []
  let sweepLookupFailed: string | null = null
  if (existingPicks.length > 0) {
    const { data: placementRows, error: placementsError } = await supabase
      .from("bet_placements")
      // `users!bet_placements_user_id_fkey`, never a bare `users`: the table
      // has carried two FKs to users since Sprint 23 and the ambiguous embed
      // is a PGRST201 that renders as "nobody bet on this" (#134).
      .select(
        "pick_id, amount, users!bet_placements_user_id_fkey ( display_name )"
      )
      .in(
        "pick_id",
        existingPicks.map((p) => p.id)
      )
    if (placementsError) {
      sweepLookupFailed = placementsError.message
    } else {
      placementRefs = (
        (placementRows ?? []) as unknown as {
          pick_id: string
          amount: number | string
          users: { display_name: string } | null
        }[]
      ).map((row) => ({
        pick_id: row.pick_id,
        amount: Number(row.amount),
        bettorName: row.users?.display_name ?? "Unknown bettor",
      }))
    }
  }

  // A failed lookup SKIPS the sweep and says so, rather than proceeding blind.
  // Guessing "no placements" would hand sweep_bets() a delete set the FK
  // rejects, turning a clean upload into a 500 — and the wrong direction to
  // guess in is the one that deletes things.
  const sweep = sweepLookupFailed
    ? null
    : planSweep(rows, existingBets, existingPicks, placementRefs)

  // Pass 1: nothing has been written and no snapshot taken. Hand back what
  // would go and let a human look at it. Deliberately BEFORE takeSnapshot(),
  // so a preview doesn't accrue a save state nobody asked for.
  if (sweep && !sweepIsEmpty(sweep) && confirmSweep === null) {
    return NextResponse.json(
      { needsConfirmation: true, sweep },
      { status: 409 }
    )
  }

  // Pass 2: the menu is re-read and the plan recomputed from the file, never
  // trusted from the client — the fingerprint only has to prove that what Pat
  // approved is still what is there. A second admin uploading in between is
  // unlikely; silently sweeping a different set because of it is not a risk
  // worth carrying for the three lines this costs.
  if (sweep && sweepConfirmed && sentFingerprint !== sweep.fingerprint) {
    return NextResponse.json(
      {
        needsConfirmation: true,
        sweep,
        error:
          "The menu changed while you were reading that list, so nothing was " +
          "imported. Here is what would go now.",
      },
      { status: 409 }
    )
  }

  // What actually gets deleted. Wagered rows are in ONLY when Pat asked for
  // them on their own control — the default keeps them and reports them.
  const sweepTargets =
    sweep && sweepConfirmed
      ? {
          betIds: [
            ...sweep.bets.clean.map((t) => t.id),
            ...(clearWagered ? sweep.bets.wagered.map((t) => t.id) : []),
          ],
          pickIds: [
            ...sweep.picks.clean.map((t) => t.id),
            ...(clearWagered ? sweep.picks.wagered.map((t) => t.id) : []),
          ],
        }
      : { betIds: [], pickIds: [] }

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

  // Every write below is checked for having actually LANDED, not merely for
  // not erroring (#159). PostgREST answers a write that RLS filtered to zero
  // rows with error === null, so `if (error)` alone is how a bet's status can
  // silently fail to change — a closed bet staying open is members still
  // betting on it. Failures accumulate rather than aborting at the first, so
  // one upload tells the admin about every row that didn't take.
  const unlanded: string[] = []

  if (plan.bets.create.length > 0) {
    const { data: created, error } = await supabase
      .from("bets")
      .insert(
        plan.bets.create.map((b) => ({ ...b, tournament_id: tournamentId }))
      )
      .select("id, sheet_bet_id")
    // The one write that still aborts on the spot: every pick below is
    // addressed by the id map this fills, so carrying on would bury the real
    // fault under a pile of undefined bet_ids.
    const missing = unlandedWrite(
      `creating ${plan.bets.create.length} bet(s)`,
      error,
      ((created ?? []) as unknown[]).length,
      plan.bets.create.length
    )
    if (missing) {
      return NextResponse.json({ error: missing }, { status: 500 })
    }
    for (const b of (created ?? []) as { id: string; sheet_bet_id: number }[]) {
      betIdBySheetId.set(b.sheet_bet_id, b.id)
    }
  }

  for (const bet of plan.bets.update) {
    const { id, ...fields } = bet
    const { data, error } = await supabase
      .from("bets")
      .update(fields)
      .eq("id", id)
      .select("id")
    const missing = unlandedWrite(
      `bet ${bet.sheet_bet_id} ("${bet.title}")`,
      error,
      ((data ?? []) as unknown[]).length,
      1
    )
    if (missing) unlanded.push(missing)
  }

  if (plan.picks.create.length > 0) {
    const { data, error } = await supabase
      .from("bet_picks")
      .insert(
        plan.picks.create.map(({ sheet_bet_id, ...pick }) => ({
          ...pick,
          bet_id: betIdBySheetId.get(sheet_bet_id)!,
        }))
      )
      .select("id")
    const missing = unlandedWrite(
      `creating ${plan.picks.create.length} pick(s)`,
      error,
      ((data ?? []) as unknown[]).length,
      plan.picks.create.length
    )
    if (missing) unlanded.push(missing)
  }

  for (const pick of plan.picks.update) {
    const { id, sheet_bet_id, ...fields } = pick
    const { data, error } = await supabase
      .from("bet_picks")
      .update({ ...fields, bet_id: betIdBySheetId.get(sheet_bet_id)! })
      .eq("id", id)
      .select("id")
    const missing = unlandedWrite(
      `pick ${pick.sheet_pick_id} ("${pick.label}")`,
      error,
      ((data ?? []) as unknown[]).length,
      1
    )
    if (missing) unlanded.push(missing)
  }

  // Every write attempted, so the list below is the whole truth about this
  // upload rather than its first casualty. It is a FAILURE and not a warning:
  // the sheet is the menu, and a row that quietly didn't take leaves the app
  // showing something the admin believes they changed.
  if (unlanded.length > 0) {
    return NextResponse.json(
      {
        error:
          `${unlanded.length} write(s) did not land. The rest of the upload WAS applied and ` +
          `nothing was rolled back — restore save state ${snapshot.id} to undo it, or fix the ` +
          `cause and re-upload (the sheet-key upsert is idempotent, so a re-upload heals a ` +
          `partial one).`,
        errors: unlanded,
      },
      { status: 500 }
    )
  }

  // The sweep runs LAST, after every upsert has landed. If it fails, the menu
  // the sheet describes is already in place and only the removal is missing —
  // the recoverable half of a bad outcome. Reversed, a successful sweep on top
  // of a failed upsert would leave a menu with holes in it.
  let swept: { bets: number; picks: number; placements: number } | null = null
  let sweepFailed: string | null = null
  if (sweepTargets.betIds.length > 0 || sweepTargets.pickIds.length > 0) {
    const { data: sweepResult, error: sweepError } = await supabase.rpc(
      "sweep_bets",
      {
        p_bet_ids: sweepTargets.betIds,
        p_pick_ids: sweepTargets.pickIds,
        p_clear_wagers: clearWagered,
      }
    )
    if (sweepError) {
      sweepFailed = sweepError.message
    } else {
      swept = sweepResult as { bets: number; picks: number; placements: number }
    }
  }
  if (sweepFailed) {
    return NextResponse.json(
      {
        error:
          `The sheet was imported, but the rows it no longer lists could NOT be ` +
          `deleted: ${sweepFailed}. The menu now matches the sheet except that ` +
          `those rows are still on it. Restore save state ${snapshot.id} to undo ` +
          `the whole upload, or re-upload to try again.`,
      },
      { status: 500 }
    )
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
    // The sweep was skipped entirely, so the menu may still carry rows the
    // sheet has dropped. Saying so is the point: "we didn't check" and
    // "there was nothing to remove" look identical in a report that stays
    // quiet (#132).
    ...(sweepLookupFailed
      ? [
          `Couldn't check which bets and picks this sheet no longer lists: ` +
            `${sweepLookupFailed}. The upload applied fine, but nothing was ` +
            `deleted — re-upload to try the sweep again.`,
        ]
      : []),
    ...(placementLookupFailed
      ? [
          `Couldn't check whether the odds-changed picks already have wagers on them: ` +
            `${placementLookupFailed}. The import applied fine — but if any of those picks ` +
            `were already bet, this report didn't tell you.`,
        ]
      : []),
  ]

  // Whether this upload was the LAST one — the same two counts POST
  // /api/admin/close runs before it will post the leaderboard, through the same
  // finalizeReadiness(). Re-read after the writes above, so they reflect the
  // sheet just applied.
  //
  // Why here at all: the checklist used to send Pat to a second page to find
  // out, and when the answer was "not yet" that page was the only thing that
  // would tell him WHICH picks were still unscored. Reporting it beside the
  // import counts puts the blockers next to the file that has to fix them.
  //
  // This does NOT post anything. The import offers; a human taps. Publishing
  // ~32 people's payouts as a side effect of a file upload would remove the one
  // moment where somebody reads the numbers first, which is the entire reason
  // finalizeReadiness() exists (#108).
  const [{ count: pendingPicks, error: pendingError }, { count: unclosedBets, error: unclosedError }] =
    await Promise.all([
      supabase
        .from("bet_picks")
        .select("id, bets!inner(tournament_id)", { count: "exact", head: true })
        .eq("result", "pending")
        .eq("bets.tournament_id", tournamentId),
      supabase
        .from("bets")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId)
        .neq("status", "closed"),
    ])
  // A counting failure degrades to "not ready" and never to a 500: the import
  // itself already succeeded and its report has to render. Not offering the
  // post is the safe direction — /admin/close is still there, and it runs the
  // real guard again anyway.
  const readyToFinalize =
    pendingError || unclosedError
      ? {
          ok: false,
          blockers: [
            "Couldn't check whether every pick has a result, so the post isn't " +
              "offered here. The import itself applied fine — post from the close " +
              "console, which runs the same check.",
          ],
        }
      : finalizeReadiness({
          pendingPicks: pendingPicks ?? 0,
          unclosedBets: unclosedBets ?? 0,
        })

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
      // Sprint 29. `swept` is what went; `keptWagered` is what the sheet
      // dropped but this upload deliberately left alone because it carries
      // wagers — the more important half of the two, because it is the part
      // Pat has to decide about rather than read past.
      swept,
      keptWagered:
        sweep && !clearWagered
          ? [...sweep.bets.wagered, ...sweep.picks.wagered]
          : [],
      warnings,
      // The undo button for the upload just applied. Surfaced in the report
      // because this is the one moment an admin knows they might want it.
      snapshotId: snapshot.id,
      // Whether this can be the final upload — { ok, blockers }. The report
      // card turns `ok` into a one-tap post and the blockers into the list of
      // what to go fix in the sheet.
      readyToFinalize,
    },
  })
}
