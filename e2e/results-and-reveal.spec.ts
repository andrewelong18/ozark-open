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
  await page.getByRole("button", { name: "Closed", exact: true }).click()

  const closedCard = page.getByTestId("bet-1")
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
  // Order matters and is the app's, not ours: /my-bets reads the newest
  // upcoming-or-active tournament, so once the final publish flips it to
  // `completed` this page correctly answers "No active tournament" and the
  // rollup moves to /results. The per-pick payouts are a during-the-weekend
  // view.
  await signOut(page)
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/my-bets")
  await expect(page.getByText("Theoretical Payout")).toBeVisible()
  await expect(page.getByText("Dan Mercer")).toBeVisible()

  // --- the final unlock ----------------------------------------------------
  await signOut(page)
  await signInAs(page, ACCOUNTS.admin)
  await page.goto("/admin/close")
  const publish = page.getByRole("button", { name: "Publish final results" })
  await expect(publish).toBeEnabled()

  // Wait for the write, not just the click. Navigating straight afterwards
  // races the POST, and /results then renders "No results yet" off a
  // tournament that is still active — a flake that looks exactly like a bug.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/admin/close") && r.request().method() === "POST"
    ),
    publish.click(),
  ])

  // --- /results renders the split ------------------------------------------
  await page.goto("/results")
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible()

  // Nothing pending, so the provisional caution must NOT be showing — that
  // banner suppresses the leader row and is the #108 inflation guard.
  await expect(page.getByText(/Provisional/)).toHaveCount(0)

  // The pool is the sum of every non-revoked entry fee, less voided stakes.
  //
  // `exact` is load-bearing: /results says "Pool $N" twice — once in the gold
  // header badge, once inside the copyable settlement summary, whose line reads
  // "Pool $N · 3 entries". A substring match hits both and fails strict mode.
  // This assertion predates the settlement summary (11f200e vs e9a4c7d, both
  // Aug 9 2026) and has been failing ever since; nobody noticed because the e2e
  // job is workflow_dispatch, not a merge gate. Exact-matching pins it to the
  // badge, which is the element this test is actually about.
  const pool = await sumEntryFees()
  await expect(page.getByText(`Pool $${pool}`, { exact: true })).toBeVisible()
  await expect(page.getByText("Top Payout")).toBeVisible()
  await expect(page.getByText("Avery Approved").first()).toBeVisible()
})

/** Entry fees of everyone still in the pool — the pari-mutuel denominator. */
async function sumEntryFees(): Promise<number> {
  const { createClient } = await import("@supabase/supabase-js")
  const { magicLinkConfigFromEnv } = await import("../scripts/magic-link.ts")
  const { supabaseUrl, serviceRoleKey } = magicLinkConfigFromEnv()
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await supabase
    .from("tournament_participants")
    .select("entry_fee")
    .is("revoked_at", null)
  if (error) throw new Error(`Couldn't total the entry fees: ${error.message}`)
  return (data ?? []).reduce((sum, row) => sum + (row.entry_fee as number), 0)
}
