// The results table, populated, at phone width.
//
// Its own file because /results only renders a table once the tournament is
// `completed`, and getting there is a one-way door: closing every bet and
// publishing the final unlock. The rest of the mobile suite runs against the
// open menu, so this goes last (alphabetically after mobile-layout and
// mobile-journey) and puts the fixture back afterwards — the same discipline
// e2e/results-and-reveal.spec.ts follows for the desktop project.
//
// Worth the setup: /results is the page the weekend ends on, it is read on a
// phone, and until this pass it was a 480px-wide grid inside a horizontal
// scroller. An overflow check against the pre-completion empty state — which is
// all the layout spec can reach — proves nothing about the table itself.

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

test.afterAll(async () => {
  reloadFixture()
  await deletePlacementsFor(ACCOUNTS.approved)
})

test("the final table fits a phone, and reads without a header row", async ({ page }) => {
  await deletePlacementsFor(ACCOUNTS.approved)

  // A wager that settles as a hit, so there are real numbers in every column.
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")
  const row = page
    .getByTestId("bet-3")
    .locator("div")
    .filter({ has: page.getByText("Dan Mercer", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Place stake" }) })
    .last()
  await row.getByRole("textbox").fill("10")
  await row.getByRole("button", { name: "Place stake" }).tap()
  await page.getByRole("button", { name: "Confirm bet" }).tap()
  await expect(page.getByText("Locked in")).toBeVisible()

  // --- close everything and publish, through the admin's real controls ------
  const allBetIds = Array.from({ length: 13 }, (_, i) => i + 1)
  const sheet = await buildMenuSheet([
    { betIds: allBetIds, status: "closed", result: "miss" },
    { betIds: [3], resultByPick: { 23: "hit" } },
  ])

  await signOut(page)
  await signInAs(page, ACCOUNTS.admin)
  await page.goto("/admin/import")
  await page.locator("#import-file").setInputFiles(sheet)
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page.getByText("Import Report")).toBeVisible()

  await page.goto("/admin/close")
  const publish = page.getByRole("button", { name: "Publish final results" })
  await expect(publish).toBeEnabled()
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/admin/close") && r.request().method() === "POST"
    ),
    publish.click(),
  ])

  // --- and now the thing under test ----------------------------------------
  await signOut(page)
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/results")
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible()
  await expect(page.getByText("Top Payout")).toBeVisible()

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth - doc.clientWidth
  })
  expect(overflow, "the results table drags the page sideways").toBeLessThanOrEqual(1)

  // The header row is sm+ only, so on a phone each money value has to carry its
  // own label — otherwise the stacked line is four bare dollar amounts and
  // nobody can tell theoretical from actual. Four labels per participant row.
  const table = page.locator("main").getByText("Avery Approved").first()
  await expect(table).toBeVisible()
  // `visible: true` matters: the sm+ header row still exists in the DOM with
  // the same words in it, hidden. Matching it would pass while the stacked
  // labels were missing — the exact defect this asserts against.
  for (const label of ["Entry", "Theo", "Payout", "P/L"]) {
    await expect(
      page.getByText(label, { exact: true }).filter({ visible: true }).first(),
      `the ${label} column lost its label when it stacked`
    ).toBeVisible()
  }

  // Every participant's name renders in full. The 480px scroller squeezed this
  // column to ~112px, which truncated real names; stacking gave it the row's
  // whole width back. Asserted as "not clipped" rather than as a pixel count,
  // because the cell shrink-wraps its text — a width assertion would be
  // measuring the name, not the column.
  // `.last()`: the winner spotlight above the table shows the same name, and
  // it's the TABLE's player column that used to be squeezed.
  const name = page
    .locator("main")
    .getByText("Avery Approved")
    .filter({ visible: true })
    .last()
  await expect(name).toBeVisible()
  const clipped = await name.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(clipped, "the player name is truncated in the results table").toBeLessThanOrEqual(1)
})
