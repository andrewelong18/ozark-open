// The other half of the funnel: an admin turns a registered account into a
// bettor, and the account can immediately place.
//
// This is the lever with money attached — approving sets the entries, and
// each phase entry is a pool input (Sprint 30 / ADR 0002). So the spec doesn't
// stop at "the row says Approved"; it signs back in as the member and proves
// the menu let them in, with the budgets the admin typed.
//
// pending@ has a seeded entry request (supabase/seed-dev-accounts.sql, $30 in
// Phase 1 and $20 in Phase 2), which is how a real approval now starts: the
// console shows what they asked for and prefills the boxes from it.

import { expect, test } from "@playwright/test"

import { ACCOUNTS, signInAs, signOut, userIdFor } from "./fixtures/auth.ts"

test("an admin approves a member from their entry request, who can then bet", async ({ page }) => {
  const memberId = await userIdFor(ACCOUNTS.pending)

  await signInAs(page, ACCOUNTS.admin)
  await page.goto("/admin/people")
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible()

  // pending@ is onboarded with no participant row — the "Awaiting approval"
  // stage. The funnel card counts them.
  await expect(page.getByText("Awaiting approval")).toBeVisible()

  const row = page.getByTestId(`person-${memberId}`)
  await expect(row).toContainText("Parker Pending")
  await expect(row).toContainText("Needs approval")
  // The row itself is the admin's cue to go check Venmo.
  await expect(row).toContainText("Asked for Phase 1 $30 · Phase 2 $20")
  await row.getByRole("button", { name: "Approve" }).click()

  // What they asked for, stated, and the two boxes prefilled from it. The
  // inputs are id'd by the member's user id — which also proves the console
  // opened the panel for the person whose row was clicked.
  await expect(page.getByText("Phase 1 $30 · Phase 2 $20 · playing")).toBeVisible()
  const phase1 = page.locator(`#approve-${memberId}-fee1`)
  const phase2 = page.locator(`#approve-${memberId}-fee2`)
  await expect(phase1).toHaveValue("30")
  await expect(phase2).toHaveValue("20")
  await expect(page.getByLabel("Playing golfer")).toBeChecked()

  // The Venmo landed short for Phase 1: the admin records what's real.
  await phase1.fill("25")
  await page.getByRole("button", { name: "Approve to bet" }).click()

  await expect(page.getByTestId(`person-${memberId}`)).toContainText("Approved")

  // The lever actually moved: sign in as them and place.
  await signOut(page)
  await signInAs(page, ACCOUNTS.pending)
  await page.goto("/bets")

  await expect(
    page.getByText(/an admin just needs to approve you before you can place bets/)
  ).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Place stake" }).first()).toBeVisible()

  // The budgets are the entries the admin typed, one bar per phase — not the
  // request, and not a default. (This used to assert "of your $25 entry", copy
  // that stopped existing when the budget bar moved; #217.)
  await page.goto("/my-bets")
  await expect(
    page.getByTestId("budget-phase-1").getByTestId("budget-summary")
  ).toHaveText("$0 of $25")
  await expect(
    page.getByTestId("budget-phase-2").getByTestId("budget-summary")
  ).toHaveText("$0 of $20")

  // Money is in, so the "no money added" warning is gone from both surfaces.
  await expect(page.getByRole("link", { name: /No money added yet/ })).toHaveCount(0)
  await page.goto("/dashboard")
  await expect(page.getByTestId("entry-warning")).toHaveCount(0)
  await expect(page.getByTestId("entry-tile")).toContainText("P1 $25 · P2 $20")
})
