// The other half of the funnel: an admin turns a registered account into a
// bettor, and the account can immediately place.
//
// This is the lever with money attached — approving sets the entry fee, and the
// entry fee is a pool input. So the spec doesn't stop at "the row says
// Approved"; it signs back in as the member and proves the menu let them in,
// with the budget the admin typed.

import { expect, test } from "@playwright/test"

import { ACCOUNTS, signInAs, signOut, userIdFor } from "./fixtures/auth.ts"

test("an admin approves a registered member, who can then bet", async ({ page }) => {
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
  await row.getByRole("button", { name: "Approve" }).click()

  // The panel's inputs are id'd by the member's user id — which also proves the
  // console opened the panel for the person whose row was clicked.
  await page.locator(`#approve-${memberId}-fee`).fill("25")
  await page.getByLabel("Playing golfer").check()
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

  // The budget is the fee the admin typed, not a default.
  await page.goto("/my-bets")
  await expect(page.getByText("of your $25 entry")).toBeVisible()
})
