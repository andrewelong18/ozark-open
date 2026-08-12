// A wager placed with a thumb.
//
// The geometry spec proves the controls are big enough and nothing is covered.
// This one proves they actually work in sequence at 412px, driven by `tap()`
// rather than `click()` — a touch event, on the emulated touchscreen, on the
// journey ~32 people will walk one-handed all weekend.
//
// It deliberately covers the pick-one path (field → ↵ → confirm), which is the
// one where a missed tap is not a mis-tap but a bet that never happened. Since
// #162 the row's stake box IS the selector — there is no radio to find first —
// so the field and the ↵ carry the whole journey.
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

  // --- a pick-one bet: every pick offers its own stake box --------------------
  // Found by the "Pick one" line rather than by sheet id, so the journey keeps
  // testing the pick-one path whatever the seed publishes. Every field is live
  // and typeable from the first render — nothing to select first (#162).
  const card = page
    .locator('[data-testid^="bet-"]')
    .filter({ hasText: "Pick one" })
    .first()
  await card.scrollIntoViewIfNeeded()
  const fields = card.getByRole("textbox")
  expect(await fields.count(), "a pick-one bet should have picks").toBeGreaterThan(1)
  for (const field of await fields.all()) {
    await expect(field).toBeEnabled()
  }

  // --- type a stake and commit it --------------------------------------------
  const field = fields.first()
  await field.tap()
  await field.fill("4")
  await card.getByRole("button", { name: "Place stake" }).first().tap()

  // Two taps to lock in a wager, on a phone as on a laptop (the guard is the
  // point — a stray tap must not be able to place money).
  const confirm = card.getByRole("button", { name: "Confirm bet" })
  await expect(confirm).toBeVisible()
  await confirm.tap()

  // The locked-odds receipt is the confirmation, and it's what proves the write
  // landed rather than the button merely accepting a tap.
  await expect(card.getByText("✓ Locked in")).toBeVisible()
  await expect(card.getByText("odds locked at placement")).toBeVisible()

  // The pick-one rule, as the rows now express it: the wager holds the bet, so
  // every other pick's box is disabled rather than refusing a tap (#162).
  for (const sibling of (await fields.all()).slice(1)) {
    await expect(sibling).toBeDisabled()
  }
  await expect(card.getByText(/Pick one · Remove your \$4 on/)).toBeVisible()

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

  // …and removing it hands the bet back: every pick is offerable again.
  for (const field of await fields.all()) {
    await expect(field).toBeEnabled()
  }
})
