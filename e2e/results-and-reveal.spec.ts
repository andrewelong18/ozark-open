// The end of the weekend: a bet closes and its wagers reveal, then results are
// published and the pari-mutuel split renders.
//
// Both halves go through the admin's real controls — a spreadsheet upload at
// /admin/import and the unlock at /admin/close — because that is the only way
// the app can reach those states (ADR 0001: the app never adjudicates a bet;
// results arrive per pick from the workbook). A spec that reached into the
// database to flip `status` would be asserting a state the app can't produce.
//
// This file runs last by name, and puts the fixture back afterwards, because
// closing a menu and completing a tournament are one-way doors.

import { expect, test } from "@playwright/test"

import {
  ACCOUNTS,
  deletePlacementsFor,
  reloadFixture,
  signInAs,
  signOut,
} from "./fixtures/auth.ts"
import { buildMenuSheet } from "./fixtures/sheet.ts"

test.describe.configure({ mode: "serial" })

test.afterAll(() => {
  reloadFixture()
})

test("wagers on an open bet stay hidden, and reveal when it closes", async ({ page }) => {
  // nonplayer@ has a seeded $6 on the OPEN bet 1 (supabase/seed-e2e.sql).
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")

  const openCard = page.getByTestId("bet-1")
  await expect(openCard).toContainText("Dan Mercer")

  // Hidden while open — the whole point of the reveal-at-close contract. RLS
  // wouldn't return the row, and the card must not hint at it either.
  await expect(openCard.getByText("Nina Nonplayer")).toHaveCount(0)
  await expect(openCard.getByText(/bettor/)).toHaveCount(0)

  // --- the admin closes bet 1 the only way the app allows: a re-upload -------
  const sheet = await buildMenuSheet([{ betIds: [1], status: "closed", result: "miss" }])

  await signOut(page)
  await signInAs(page, ACCOUNTS.admin)
  await page.goto("/admin/import")
  await page.locator("#import-file").setInputFiles(sheet)
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page.getByText("Import Report")).toBeVisible()

  // --- and now the same member sees it --------------------------------------
  await signOut(page)
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")
  // Bet 1 does not move tabs when it closes — it is a Phase 1 bet before and
  // after (#193). What changes is the card it renders and the badge on it.
  const closedCard = page.getByTestId("bet-1")
  await expect(closedCard).toContainText("Closed")
  const toggle = closedCard.getByRole("button", { name: /(Show|Hide) 1 bettor\b/ })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(closedCard.getByText("Nina Nonplayer")).toBeVisible()
})

test("results publish, and the pari-mutuel split renders", async ({ page }) => {
  await deletePlacementsFor(ACCOUNTS.approved)

  // A wager that will settle as a hit, so there's a payout to render.
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")
  const row = page
    .getByTestId("bet-3")
    .locator("div")
    .filter({ has: page.getByText("Dan Mercer", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Place stake" }) })
    .last()
  await row.getByRole("textbox").fill("10")
  await row.getByRole("button", { name: "Place stake" }).click()
  await page.getByRole("button", { name: "Confirm bet" }).click()
  await expect(page.getByText("Locked in")).toBeVisible()

  // --- the admin closes every bet and publishes every result ---------------
  const allBetIds = Array.from({ length: 13 }, (_, i) => i + 1)
  const sheet = await buildMenuSheet([
    { betIds: allBetIds, status: "closed", result: "miss" },
    // The wager above wins: sheet_pick_id 23 is bet 3's Dan Mercer, at +110.
    { betIds: [3], resultByPick: { 23: "hit" } },
  ])

  await signOut(page)
  await signInAs(page, ACCOUNTS.admin)
  await page.goto("/admin/import")
  await page.locator("#import-file").setInputFiles(sheet)
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page.getByText("Import Report")).toBeVisible()

  // --- the member's rollup, BEFORE the final unlock -------------------------
  // Checked here rather than after the publish only because that is the order
  // the weekend runs in. /my-bets reads `completed` tournaments too since
  // Sprint 28 (#197) — people re-read their own card against the payouts all
  // night — so this no longer goes dark at the flip. It used to, and the
  // comment that used to be here said so.
  await signOut(page)
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/my-bets")
  await expect(page.getByText("Theoretical Payout")).toBeVisible()
  await expect(page.getByText("Dan Mercer")).toBeVisible()

  // --- the final unlock ----------------------------------------------------
  await signOut(page)
  await signInAs(page, ACCOUNTS.admin)
  await page.goto("/admin/close")
  const publish = page.getByRole("button", { name: "Post the leaderboard" })
  await expect(publish).toBeEnabled()

  // Wait for the write, not just the click. Navigating straight afterwards
  // races the POST, and the dashboard then renders the live betting console off
  // a tournament that is still active — a flake that looks exactly like a bug.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/admin/close") && r.request().method() === "POST"
    ),
    publish.click(),
  ])

  // --- the dashboard becomes the standings ---------------------------------
  // Sprint 28 (#197): posting swaps the dashboard itself. /results is a
  // redirect now, so this navigates to the page members actually land on.
  await page.goto("/dashboard")
  await expect(
    page.getByRole("heading", { name: "Final Standings" })
  ).toBeVisible()

  // The betting console is GONE — this is the swap, and each of these is a
  // module Pat named. The countdown included: both branches go, and the
  // "Opening ceremony" fallback is the one that would otherwise survive.
  await expect(page.getByText("Pool Total")).toHaveCount(0)
  await expect(page.getByRole("link", { name: /Place Bets/ })).toHaveCount(0)
  await expect(page.getByText("Opening ceremony")).toHaveCount(0)

  // Nothing pending, so the provisional caution must NOT be showing — that
  // banner suppresses the leader row and is the #108 inflation guard.
  await expect(page.getByText(/Provisional/)).toHaveCount(0)

  // The pool badge. Since Sprint 30 (ADR 0002) each phase is its own pot, and
  // the board opens on Phase 1 here: its bets are all closed, while this
  // fixture's Phase 2 was never published, so Phase 2 (and Combined) can't be
  // shown yet. The Phase 1 pool is every Phase 1 entrant's COMMITTED money —
  // min(entry, max(wagered, $20)) — less voided stakes, computed below from
  // the database rather than restated from the page.
  //
  // `exact` pins the assertion to the badge: "Pool $N" appears nowhere else.
  await expect(page.getByRole("button", { name: "Phase 1", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  const pool = await phaseOnePool()
  await expect(page.getByText(`Pool ${pool}`, { exact: true })).toBeVisible()
  await expect(page.getByText("Biggest Winner")).toBeVisible()
  await expect(page.getByText("Avery Approved").first()).toBeVisible()

  // Phase 2 was never published, so its tab shows the pot and says why there
  // are no standings — it never renders a split of rows it can't see.
  await page.getByRole("button", { name: "Phase 2", exact: true }).click()
  await expect(page.getByTestId("standings-unrevealed")).toContainText(
    "Standings appear once Phase 2's bets have closed."
  )
})

/**
 * The Phase 1 pool as ADR 0002 defines it, from the rows: for everyone still
 * in with a Phase 1 entry, min(entry, max(wagered in Phase 1, entry_fee_min)),
 * summed, less the Phase 1 voided stakes. Formatted the way the badge formats
 * money — whole dollars stay whole.
 */
async function phaseOnePool(): Promise<string> {
  const { createClient } = await import("@supabase/supabase-js")
  const { magicLinkConfigFromEnv } = await import("../scripts/magic-link.ts")
  const { supabaseUrl, serviceRoleKey } = magicLinkConfigFromEnv()
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, entry_fee_min")
    .eq("year", 2026)
    .single()
  if (tournamentError || !tournament) throw new Error(`No 2026 tournament: ${tournamentError?.message}`)

  const { data: participants, error: participantError } = await supabase
    .from("tournament_participants")
    .select("user_id, phase1_entry_fee")
    .eq("tournament_id", tournament.id)
    .is("revoked_at", null)
    .not("phase1_entry_fee", "is", null)
  if (participantError) throw new Error(`Couldn't read the entries: ${participantError.message}`)

  const { data: rows, error: rowsError } = await supabase
    .from("placement_payouts_view")
    .select("user_id, amount, refunded_stake")
    .eq("tournament_id", tournament.id)
    .eq("phase", 1)
  if (rowsError) throw new Error(`Couldn't read the payout view: ${rowsError.message}`)

  let pool = 0
  for (const p of participants ?? []) {
    const mine = (rows ?? []).filter((r) => r.user_id === p.user_id)
    const wagered = mine.reduce((sum, r) => sum + Number(r.amount), 0)
    const voided = mine.reduce((sum, r) => sum + Number(r.refunded_stake ?? 0), 0)
    const entry = Number(p.phase1_entry_fee)
    // Mirrors phaseStanding()'s committed, A28 included: wagering nothing in
    // the phase commits nothing, so the floor needs a wager behind it. This is
    // a second implementation of lib/validation.ts on purpose — the spec has
    // to derive the badge independently — so it has to track that rule too.
    const committed =
      wagered === 0 ? 0 : Math.min(entry, Math.max(wagered, tournament.entry_fee_min))
    pool += committed - voided
  }
  return Number.isInteger(pool) ? `$${pool}` : `$${pool.toFixed(2)}`
}
