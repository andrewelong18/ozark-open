// Fixture surgery for the §7 rules gauntlet.
//
// Three of the money rules only fire under conditions the sample menu doesn't
// naturally produce, which is exactly why the Jul 31 dry run never exercised
// them (docs/dry-run/ISSUE_LOG.md, "What this session did NOT exercise"):
//
//   * the max-single-bet FLOOR needs an entry fee where pct × fee isn't whole
//   * the self-bet cap and the opponent block need picks LINKED to the bettor,
//     and the sample menu's labels are golfer names that match nobody
//   * "tournament-wide, not per-phase" needs a second phase, and the sample
//     menu is Phase 1 only
//
// So these helpers build those conditions directly rather than going through
// the importer's name-matching. That split is deliberate: whether a label
// matches a display name is lib/import.ts's job and is pinned by its own tests
// plus e2e/bets-menu.spec.ts (#102). What's under test HERE is what the rules
// do once a link exists.
//
// Everything writes through the service-role client or psql, bypassing RLS —
// setup only. Every assertion in the gauntlet reads the DOM, with one stated
// exception documented at its call site.

import { execFileSync } from "node:child_process"

import { createClient } from "@supabase/supabase-js"

import { magicLinkConfigFromEnv } from "../../scripts/magic-link.ts"

function serviceClient() {
  const { supabaseUrl, serviceRoleKey } = magicLinkConfigFromEnv()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function db(sql: string): string {
  const dbUrl = process.env.E2E_DB_URL
  if (!dbUrl) throw new Error("E2E_DB_URL isn't set — run through scripts/e2e-verify.sh.")
  return execFileSync("psql", [dbUrl, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf-8",
  }).trim()
}

/** The `users.id` behind a seeded email. */
export async function userIdFor(email: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from("users")
    .select("id")
    .eq("email", email)
    .single()
  if (error || !data) throw new Error(`No account for ${email}: ${error?.message ?? "not found"}`)
  return data.id as string
}

/**
 * Set a member's entry fee.
 *
 * The gauntlet moves approved@ off its seeded $30 because $30 hides the bug it
 * is hunting: 50% of $30 is exactly $15, so a floor and a round agree. Only a
 * fee with a half-dollar at 50% — $25 → $12.5 — tells them apart.
 */
export async function setEntryFee(email: string, entryFee: number): Promise<void> {
  const userId = await userIdFor(email)
  db(`UPDATE public.tournament_participants SET entry_fee = ${entryFee}
      WHERE user_id = '${userId}'`)
}

/**
 * Point a pick at a member, the way a matched import would.
 *
 * Verifies the write landed. A silent no-op here is the worst possible
 * failure: the rules under test only fire on a LINKED pick, so an unlinked one
 * makes the spec pass by not exercising anything — the opponent block simply
 * never applies and the wager goes through, which reads as "no bug".
 */
export async function linkPickToUser(sheetPickId: number, email: string): Promise<void> {
  const userId = await userIdFor(email)
  const updated = db(`
    WITH u AS (
      UPDATE public.bet_picks SET player_user_id = '${userId}'
       WHERE sheet_pick_id = ${sheetPickId}
       RETURNING 1
    ) SELECT count(*) FROM u
  `)
  if (updated !== "1") {
    throw new Error(
      `linkPickToUser(${sheetPickId}) updated ${updated} rows, expected 1 — ` +
        "the fixture the rule depends on isn't there."
    )
  }
}

/** Release every pick→player link the gauntlet made. */
export function unlinkAllPicks(): void {
  db("UPDATE public.bet_picks SET player_user_id = NULL WHERE player_user_id IS NOT NULL")
}

/**
 * A Phase 2 bet carrying one pick that belongs to `email`.
 *
 * Needed because the sample menu is Phase 1 only, and the claim under test —
 * that the self-bet cap counts the whole tournament rather than resetting each
 * phase — is unfalsifiable inside a single phase. A per-phase implementation
 * would pass every single-phase test written against it.
 *
 * sheet ids start at 900 to stay clear of the sample menu's 1–57.
 */
export async function createPhase2SelfBet(email: string): Promise<void> {
  const userId = await userIdFor(email)
  db(`
    WITH t AS (SELECT id FROM public.tournaments WHERE year = 2026),
         c AS (SELECT id FROM public.bet_categories WHERE name = 'Top Finisher'),
         b AS (
           INSERT INTO public.bets
             (tournament_id, category_id, sheet_bet_id, title, phase, round, status, total_probability)
           SELECT t.id, c.id, 900, 'Phase 2 Winner', 2, 'tournament', 'open', 1.0
           FROM t, c
           ON CONFLICT (tournament_id, sheet_bet_id) DO UPDATE SET status = 'open'
           RETURNING id
         )
    INSERT INTO public.bet_picks
      (bet_id, sheet_pick_id, label, american_odds, fractional_odds, probability, player_user_id, result)
    SELECT b.id, 900, 'Avery Approved', 150, '3/2', 0.4, '${userId}', 'pending'
    FROM b
    ON CONFLICT (bet_id, sheet_pick_id) DO UPDATE SET player_user_id = EXCLUDED.player_user_id
  `)
}

/** Remove the synthetic Phase 2 bet, so the next spec inherits the real menu. */
export function dropPhase2SelfBet(): void {
  db(`DELETE FROM public.bet_placements
       WHERE pick_id IN (SELECT id FROM public.bet_picks WHERE sheet_pick_id = 900)`)
  db(`DELETE FROM public.bet_picks WHERE sheet_pick_id = 900`)
  db(`DELETE FROM public.bets WHERE sheet_bet_id = 900`)
}

/** Seed a wager directly, for the "already has money down" preconditions. */
export async function seedWager(email: string, sheetPickId: number, amount: number): Promise<void> {
  const userId = await userIdFor(email)
  db(`
    INSERT INTO public.bet_placements (user_id, pick_id, amount, odds_at_placement)
    SELECT '${userId}', p.id, ${amount}, p.american_odds
    FROM public.bet_picks p WHERE p.sheet_pick_id = ${sheetPickId}
    ON CONFLICT (user_id, pick_id) DO UPDATE
      SET amount = EXCLUDED.amount, deleted_at = NULL
  `)
}

/**
 * Every placement row for a member on one pick, soft-deleted included.
 *
 * The one place the gauntlet reads the database to assert rather than to set
 * up, because row identity has no DOM representation: a revived row and a
 * freshly-inserted second row render identically. See the call site.
 */
export async function placementRowsFor(
  email: string,
  sheetPickId: number
): Promise<{ id: string; amount: number; deleted: boolean }[]> {
  const userId = await userIdFor(email)
  const out = db(`
    SELECT p.id || '|' || p.amount || '|' || (p.deleted_at IS NOT NULL)
    FROM public.bet_placements p
    JOIN public.bet_picks pk ON pk.id = p.pick_id
    WHERE p.user_id = '${userId}' AND pk.sheet_pick_id = ${sheetPickId}
    ORDER BY p.created_at
  `)
  if (!out) return []
  return out.split("\n").map((line) => {
    const [id, amount, deleted] = line.split("|")
    return { id, amount: Number(amount), deleted: deleted === "t" }
  })
}
