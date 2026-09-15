// The one-time entry request (Sprint 30 / PRD §12 A26): a member asks to put
// money in — a total, split between the phases — once, and is sent to Venmo.
//
// Three promises, each of which fails quietly when broken:
//
//   1. Nobody with no money in can miss it. The dashboard's entry tile and the
//      My Bets budget both carry a warning until money is asked for or
//      recorded, and both lead to the form.
//   2. The form can only ask for what the rules allow — $20 to $50 per phase,
//      or $0 to sit a phase out — and the server says the same thing.
//   3. It really is once. The confirm says so before the tap, and a second
//      request is refused by the database, not just hidden by the page.

import { expect, test } from "@playwright/test"

import {
  ACCOUNTS,
  deletePlacementsFor,
  resetOnboarding,
  signInAs,
  signOut,
  userIdFor,
} from "./fixtures/auth.ts"
import { restoreEntries, setEntryFee } from "./fixtures/rules.ts"

test.describe.configure({ mode: "serial" })

test.afterAll(async () => {
  await restoreEntries(ACCOUNTS.approved, 30, 30)
  // Clears newbie@'s request and participant row, so the onboarding journey
  // after this file starts clean.
  await resetOnboarding(ACCOUNTS.newbie)
})

test("an approved member with no money in is warned on the dashboard and My Bets", async ({
  page,
}) => {
  // Approved (the row exists) but no entry in either phase, and no request.
  // Wagers first: an entry can't be cleared out from under them (OZ002).
  await deletePlacementsFor(ACCOUNTS.approved)
  await setEntryFee(ACCOUNTS.approved, null, 1)
  await setEntryFee(ACCOUNTS.approved, null, 2)

  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/dashboard")
  await expect(page.getByTestId("entry-warning")).toBeVisible()
  await expect(page.getByTestId("entry-tile")).toContainText("Request your entry")

  // The tile IS the way in.
  await page.getByTestId("entry-tile").click()
  await expect(page).toHaveURL(/\/entry$/)
  await expect(page.getByTestId("entry-form")).toBeVisible()

  // My Bets carries the same warning on its budget header, and it leads to the
  // same place.
  await page.goto("/my-bets")
  const warning = page.getByRole("link", { name: "No money added yet — request your entry" })
  await expect(warning).toBeVisible()
  await warning.click()
  await expect(page).toHaveURL(/\/entry$/)

  // And the bet menu won't take a stake from them in either phase.
  await page.goto("/bets")
  await expect(page.getByText("No money in yet")).toBeVisible()
  await expect(page.getByRole("button", { name: "Place stake" })).toHaveCount(0)

  await restoreEntries(ACCOUNTS.approved, 30, 30)
})

test("a new member requests once during onboarding, is sent to Venmo, and can't ask again", async ({
  page,
}) => {
  await resetOnboarding(ACCOUNTS.newbie)
  const newbieId = await userIdFor(ACCOUNTS.newbie)

  await signInAs(page, ACCOUNTS.newbie)
  await page.goto("/onboarding")
  await page.locator("#display-name").fill("Nate Newbie")
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByText("How the Sportsbook Works")).toBeVisible()
  for (const step of [2, 3, 4]) {
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await expect(page.getByText(`${step} of 4`)).toBeVisible()
  }
  await page.getByRole("button", { name: "Next", exact: true }).click()
  const form = page.getByTestId("entry-form")
  await expect(form).toBeVisible()

  // --- the bounds, in the form ---------------------------------------------
  const total = page.getByTestId("entry-total")
  const submit = page.getByTestId("entry-submit")

  await total.fill("101")
  await expect(submit).toBeDisabled()
  await expect(form.getByRole("alert")).toContainText("Totals run from $20 to $100")

  await total.fill("15")
  await expect(submit).toBeDisabled()

  // $30 fits in one phase but can't be split — both halves would be under $20.
  await total.fill("30")
  await expect(submit).toBeEnabled()
  await expect(form).toContainText("$30 fits in one phase — slide to pick which.")

  // --- the bounds, at the server ---------------------------------------------
  // The form is UX; the route is the rule. A hand-built request for $15 in
  // Phase 1 is refused with the sentence the form's rules come from, and
  // writes nothing (the real request below still lands).
  const bad = await page.request.post("/api/entry-request", {
    data: { phase1: 15, phase2: 30, isPlayer: true },
  })
  expect(bad.status()).toBe(400)
  expect((await bad.json()).errors).toEqual([
    "Phase 1 entry must be between $20 and $50, or $0 to sit Phase 1 out.",
  ])

  // --- the real request ------------------------------------------------------
  await total.fill("60")
  // The slider starts on $20 in Phase 1. Arrow keys, not fill(): they move a
  // range input the way a thumb does, so React sees a real input event.
  const slider = page.getByTestId("entry-slider")
  await slider.focus()
  for (let i = 0; i < 10; i++) await slider.press("ArrowRight")
  await expect(page.getByTestId("entry-preview")).toContainText("Phase 1 $30 · Phase 2 $30")
  await expect(page.getByTestId("entry-playing")).toBeChecked()
  await submit.click()

  // The two-tap confirm says out loud that this is the only chance.
  const confirm = page.getByTestId("entry-confirm")
  await expect(confirm).toContainText("Request $60 — Phase 1 $30 · Phase 2 $30?")
  await expect(confirm).toContainText("This is your one chance")
  await page.getByTestId("entry-confirm-button").click()

  // Venmo, the amount, and the memo.
  const done = page.getByTestId("entry-done")
  await expect(done).toContainText("Now pay $60 on Venmo")
  await expect(done).toContainText("golf")
  const venmo = page.getByTestId("entry-venmo")
  await expect(venmo).toHaveAttribute("href", "https://venmo.com/u/AndrewLong99")
  await expect(venmo).toHaveAttribute("target", "_blank")

  await done.getByRole("button", { name: "Start betting" }).click()
  await expect(page).toHaveURL(/\/bets/)

  // --- once means once ---------------------------------------------------------
  // The dashboard stops warning and says what's pending instead.
  await page.goto("/dashboard")
  await expect(page.getByTestId("entry-warning")).toHaveCount(0)
  await expect(page.getByTestId("entry-tile")).toContainText("Requested · awaiting approval")

  // /entry is a receipt now, never the form.
  await page.goto("/entry")
  await expect(page.getByTestId("entry-requested")).toContainText("Requested: $60")
  await expect(page.getByTestId("entry-form")).toHaveCount(0)

  // And a second request from the same session is refused by the database.
  const again = await page.request.post("/api/entry-request", {
    data: { phase1: 20, phase2: 20, isPlayer: true },
  })
  expect(again.status()).toBe(409)
  expect((await again.json()).error).toBe(
    "You've already requested your entry — it can't be changed in the app. Ask an admin if something's wrong."
  )

  // --- the admin's side --------------------------------------------------------
  await signOut(page)
  await signInAs(page, ACCOUNTS.admin)
  await page.goto("/admin/people")
  await expect(page.getByTestId(`person-${newbieId}`)).toContainText(
    "Asked for Phase 1 $30 · Phase 2 $30"
  )
})
