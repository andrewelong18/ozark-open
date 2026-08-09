// A brand-new member's first three minutes: forced through onboarding, then
// parked on a read-only menu until an admin approves them.
//
// The "view-only" half is the one that matters for the money. A member who
// hasn't been approved has no entry fee, so they are not in the pool — and the
// menu must give them no way to place. Asserting the reassuring banner is not
// enough; the banner could render perfectly while a stake box sat underneath
// it. So this asserts the absence of the control.

import { expect, test } from "@playwright/test"

import { ACCOUNTS, resetOnboarding, signInAs } from "./fixtures/auth.ts"

test("a new member is forced through onboarding and lands view-only", async ({ page }) => {
  await resetOnboarding(ACCOUNTS.newbie)
  await signInAs(page, ACCOUNTS.newbie)

  // The middleware sends an un-onboarded account to /onboarding from anywhere.
  // Proving it by asking for a different page is the real assertion — landing
  // there straight from the callback would also happen if it were the default.
  await page.goto("/bets")
  await expect(page).toHaveURL(/\/onboarding/)
  await expect(page.getByText("Set up your profile")).toBeVisible()

  await page.locator("#display-name").fill("Nate Newbie")
  await page.locator("#nickname").fill("Rookie")
  await page.getByRole("button", { name: "Continue" }).click()

  // The walkthrough: four cards, and the counter is the reliable step marker.
  await expect(page.getByText("How the Sportsbook Works")).toBeVisible()
  await expect(page.getByText("1 of 4")).toBeVisible()
  await expect(page.getByText("One shared pot, no house")).toBeVisible()

  // `exact` matters: without it this also matches "Open Next.js Dev Tools".
  for (const step of [2, 3, 4]) {
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await expect(page.getByText(`${step} of 4`)).toBeVisible()
  }
  await expect(page.getByText("Everything reveals at close")).toBeVisible()

  await page.getByRole("button", { name: "Start betting" }).click()
  await expect(page).toHaveURL(/\/bets/)

  // Their chosen name took, and it's the name the app now calls them.
  await expect(page.getByRole("link", { name: /Nate Newbie/ })).toBeVisible()

  // Registered, not yet approved: the menu is browsable and inert.
  await expect(
    page.getByText(/an admin just needs to approve you before you can place bets/)
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Bet Menu" })).toBeVisible()
  await expect(page.getByTestId("bet-1")).toContainText("Dan Mercer")

  // The assertion with teeth: no way in to the money.
  await expect(page.getByRole("button", { name: "Place stake" })).toHaveCount(0)
  await expect(page.getByRole("textbox")).toHaveCount(0)
})

test("re-visiting onboarding once you're done just sends you on", async ({ page }) => {
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/onboarding")
  await expect(page).toHaveURL(/\/dashboard/)
})
