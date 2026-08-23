// Place, edit, remove — the three writes that move money — driven through the
// two-tap confirm, with /my-bets re-read after each one.
//
// /my-bets is read-only by design: editing and removing live on /bets (re-place
// over a stake = edit, "Remove bet" = soft delete). So the pattern here is
// act on /bets, then go and read the consequence on /my-bets, which is what a
// member actually does.

import { expect, type Page } from "@playwright/test"
import { test } from "@playwright/test"

import { ACCOUNTS, deletePlacementsFor, signInAs } from "./fixtures/auth.ts"

/** approved@ is seeded at a $30 entry (supabase/seed-dev-accounts.sql). */
const ENTRY_FEE = 30

/** The stake box on a given pick row, found via the pick's name — as TEXT: an
 * unlinked label ("Dan Mercer" matches no member here) was a button only while
 * it doubled as the radio's partner, and since #162 it is a plain name. */
function stakeRow(page: Page, betTestId: string, pickName: string) {
  return page
    .getByTestId(betTestId)
    .locator("div")
    .filter({ has: page.getByText(pickName, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Place stake" }) })
    .last()
}

/** The running total in /my-bets' budget bar (the Total Wagered stat card
 * until the bar moved here from the dashboard). Testid, not text: a bare $10
 * matches four things on the page, and "$1" is inside "$10 of $40". */
function totalWagered(page: Page) {
  return page.getByTestId("budget-wagered")
}

async function place(page: Page, betTestId: string, pickName: string, amount: string) {
  const row = stakeRow(page, betTestId, pickName)
  await row.getByRole("textbox").fill(amount)
  await row.getByRole("button", { name: "Place stake" }).click()
}

test.beforeEach(async ({ page }) => {
  await deletePlacementsFor(ACCOUNTS.approved)
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")
  await expect(page.getByRole("heading", { name: "Bet Menu" })).toBeVisible()
})

test("place, edit and remove a wager, with My Bets following each step", async ({ page }) => {
  // --- place ---------------------------------------------------------------
  await place(page, "bet-1", "Dan Mercer", "10")

  // Two taps, never one: staging the amount must not have written anything.
  await expect(page.getByRole("button", { name: "Confirm bet" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm bet" }).click()
  await expect(page.getByText("Locked in")).toBeVisible()

  await page.goto("/my-bets")
  // The budget bar carries both numbers the Total Wagered and Remaining
  // Budget stat cards used to: what's wagered, and the entry it has to reach.
  await expect(page.getByTestId("budget-summary")).toHaveText(
    `$10 of $${ENTRY_FEE}`
  )
  await expect(page.getByText("Dan Mercer")).toBeVisible()

  // --- edit ----------------------------------------------------------------
  await page.goto("/bets")
  await place(page, "bet-1", "Dan Mercer", "12")
  await expect(page.getByRole("button", { name: "Confirm change" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm change" }).click()
  await expect(page.getByText("Locked in")).toBeVisible()

  await page.goto("/my-bets")
  await expect(totalWagered(page)).toHaveText("$12")

  // --- remove --------------------------------------------------------------
  await page.goto("/bets")
  await page.getByTestId("bet-1").getByRole("button", { name: /Remove bet/ }).click()
  await page.getByRole("button", { name: "Remove bet", exact: true }).click()

  await page.goto("/my-bets")
  await expect(page.getByText("Dan Mercer")).toHaveCount(0)
})

test("a §7 violation is refused by the server and shown verbatim", async ({ page }) => {
  // Max single bet is 50% of the entry, capped at $20 — $15 on a $30 entry.
  // $16 is one dollar over, so this tests the rule and not a typo guard.
  await place(page, "bet-1", "Dan Mercer", "16")
  await page.getByRole("button", { name: "Confirm bet" }).click()

  // The server's message, rendered verbatim — not a generic "something went
  // wrong". The client checks are UX; this one has to come from the API.
  // Scoped past Next's route announcer, which is also role="alert" and empty.
  const alert = page.getByRole("alert").filter({ hasText: "Max single bet" })
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(`Max single bet is $15 for your $${ENTRY_FEE} entry.`)

  // Refused means refused: nothing was written.
  await page.goto("/my-bets")
  await expect(page.getByText("Dan Mercer")).toHaveCount(0)
})
