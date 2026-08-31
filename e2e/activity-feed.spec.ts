// The dashboard activity feed, and the line it must not cross.
//
// The feature's whole licence to exist pre-close is that it says WHO is playing
// and never WHAT they played (PRD §8, §12). That claim is enforced by a column
// list inside a SECURITY DEFINER function, which no unit test can reach: the
// interesting failure is a future join or an extra column leaking the position
// half, and it would look like a perfectly ordinary feed. So these specs read
// the rendered rail and assert what is absent as carefully as what is present.
//
// They also exercise the two halves that can only be observed in a browser: a
// second member seeing the first member's wager while the bet is still OPEN
// (impossible under RLS without the definer function — a plain read returns
// your own rows), and the feed catching up on a tab wake without a reload.

import { expect, test, type Page } from "@playwright/test"

import { ACCOUNTS, deletePlacementsFor, signInAs, signOut } from "./fixtures/auth.ts"

// Serial: every test here shares one placement fixture, and the last one adds
// to it deliberately.
test.describe.configure({ mode: "serial" })

/** Display names from supabase/seed-dev-accounts.sql. */
const APPROVED_NAME = "Avery Approved"

// Two picks on bet 1, which is a Top Finisher — multiple picks allowed, so the
// second wager is a NEW placement row (and a new feed event) rather than an
// edit of the first. They double as leak canaries: neither label may ever
// appear inside the activity rail.
const PICK = "Dan Mercer"
const OTHER_PICK = "Garrett Klenke"

function feed(page: Page) {
  return page.getByTestId("activity-feed")
}

async function placeAWager(page: Page, pick: string, amount: string) {
  await page.goto("/bets")
  await expect(page.getByRole("heading", { name: "Bet Menu" })).toBeVisible()
  const row = page
    .getByTestId("bet-1")
    .locator("div")
    .filter({ has: page.getByText(pick, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Place stake" }) })
    .last()
  await row.getByRole("textbox").fill(amount)
  await row.getByRole("button", { name: "Place stake" }).click()
  await page.getByRole("button", { name: /^Confirm/ }).click()
  await expect(page.getByText("Locked in")).toBeVisible()
}

/**
 * Everything the feed is forbidden to say, asserted in one place.
 *
 * The dollar check is the sharp one: the rail carries no money at all, so any
 * "$" inside it means a stake, a payout or an entry fee has leaked into a
 * surface that is readable while the bet is still open.
 */
async function expectNoPositions(page: Page) {
  const rail = feed(page)
  await expect(rail).not.toContainText("$")
  await expect(rail).not.toContainText(PICK)
  await expect(rail).not.toContainText(OTHER_PICK)
  await expect(rail).not.toContainText("Win Tournament")
}

test.afterAll(async () => {
  await deletePlacementsFor(ACCOUNTS.approved)
})

test("a wager reaches the feed as a name and a moment", async ({ page }) => {
  await deletePlacementsFor(ACCOUNTS.approved)
  await signInAs(page, ACCOUNTS.approved)

  await placeAWager(page, PICK, "10")

  await page.goto("/dashboard")
  await expect(feed(page).getByText(APPROVED_NAME).first()).toBeVisible()
  await expect(feed(page).getByText("placed a bet").first()).toBeVisible()
  await expectNoPositions(page)
})

test("another member sees it while the bet is still open", async ({ page }) => {
  // The definer function's reason for existing, stated as a test: under the RLS
  // policies alone this row is invisible until the bet closes, so a feed that
  // only ever showed you yourself would pass every other check in this file.
  await signInAs(page, ACCOUNTS.nonplayer)
  await page.goto("/dashboard")

  await expect(feed(page).getByText(APPROVED_NAME).first()).toBeVisible()
  await expectNoPositions(page)

  await signOut(page)
})

test("the feed catches up on a tab wake, without a reload", async ({ page, context }) => {
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/dashboard")
  const rows = feed(page).getByText("placed a bet")
  const before = await rows.count()

  // A second wager placed in another tab of the SAME session — the realistic
  // shape of "someone else bet while you were sitting on the dashboard", and it
  // leaves this page untouched so a refresh can't be what updates it.
  const other = await context.newPage()
  await placeAWager(other, OTHER_PICK, "2")
  await other.close()

  // The wake path the poll shares. Asserting this rather than sleeping through
  // a 20-second interval keeps the spec deterministic — and it is the path a
  // phone actually takes, since a backgrounded tab skips its ticks.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))

  await expect(rows).toHaveCount(before + 1)
  await expectNoPositions(page)
})
