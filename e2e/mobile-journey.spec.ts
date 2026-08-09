// A wager placed with a thumb.
//
// The geometry spec proves the controls are big enough and nothing is covered.
// This one proves they actually work in sequence at 412px, driven by `tap()`
// rather than `click()` — a touch event, on the emulated touchscreen, on the
// journey ~32 people will walk one-handed all weekend.
//
// It deliberately covers the pick-one path (radio → field → ↵ → confirm), which
// is the one where a missed tap is not a mis-tap but a bet that never happened:
// the golfer's name is a profile link, so the 20px radio is the only selector.
//
// Everything it asserts is rendered DOM. The desktop suite already owns what
// the writes do to the database.

import { expect, test } from "@playwright/test"

import { ACCOUNTS, deletePlacementsFor, signInAs } from "./fixtures/auth.ts"

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  await deletePlacementsFor(ACCOUNTS.approved)
})

test.afterAll(async () => {
  await deletePlacementsFor(ACCOUNTS.approved)
})

test("place a bet with a thumb, end to end", async ({ page }) => {
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")
  await expect(page.getByRole("heading", { name: "Bet Menu" })).toBeVisible()

  // The tally bar starts empty and fixed over the bottom of the menu.
  const slip = page.getByRole("link", { name: /Review all/ })
  await expect(slip).toBeVisible()
  await expect(page.getByText("No picks placed yet")).toBeVisible()

  // --- a pick-one bet: the radio is the only way in ---------------------------
  const radio = page.getByRole("radio").first()
  await radio.scrollIntoViewIfNeeded()
  await radio.tap()
  await expect(radio).toHaveAttribute("aria-checked", "true")

  // Selecting reveals exactly one stake field on the chosen pick.
  const card = radio.locator("xpath=ancestor::*[@data-testid][1]")
  const field = card.getByRole("textbox")
  await expect(field).toHaveCount(1)

  // --- type a stake and commit it --------------------------------------------
  await field.tap()
  await field.fill("4")
  await card.getByRole("button", { name: "Place stake" }).tap()

  // Two taps to lock in a wager, on a phone as on a laptop (the guard is the
  // point — a stray tap must not be able to place money).
  const confirm = card.getByRole("button", { name: "Confirm bet" })
  await expect(confirm).toBeVisible()
  await confirm.tap()

  // The locked-odds receipt is the confirmation, and it's what proves the write
  // landed rather than the button merely accepting a tap.
  await expect(card.getByText("✓ Locked in")).toBeVisible()
  await expect(card.getByText("odds locked at placement")).toBeVisible()

  // And the fixed bar caught up without moving off the bottom of the screen.
  await expect(page.getByText(/1 pick/)).toBeVisible()
  const barBox = await slip.boundingBox()
  expect(barBox).not.toBeNull()
  expect(barBox!.y + barBox!.height, "the tally bar drifted off-screen").toBeLessThanOrEqual(915)

  // --- and remove it, which is also two taps ---------------------------------
  await card.getByRole("button", { name: /Remove bet/ }).first().tap()
  await card.getByRole("button", { name: "Remove bet", exact: true }).tap()
  await expect(card.getByText("✓ Locked in")).toHaveCount(0)
  await expect(page.getByText("No picks placed yet")).toBeVisible()
})
