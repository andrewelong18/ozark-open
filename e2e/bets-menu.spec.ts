// The bet menu, asserted on what's actually on screen.
//
// This spec exists because of #105. sortPicks ran server-side, the menu then
// re-sorted by sheet_pick_id and threw the result away, and it shipped: eleven
// passing unit tests, a green build, and nothing on the page. A journey that
// only checked the page loaded would have missed it too. So every assertion
// here reads rendered DOM — the order of names, the text of a badge, the
// aria-state of a toggle — never a server response or a database row.

import { expect, test } from "@playwright/test"

import { ACCOUNTS, signInAs } from "./fixtures/auth.ts"

test.beforeEach(async ({ page }) => {
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")
  await expect(page.getByRole("heading", { name: "Bet Menu" })).toBeVisible()
})

// The fixture's open bet 1 ("Win Tournament") is chosen precisely because sheet
// order and favourites-first DISAGREE: Alex Leslie is +900 at sheet_pick_id 4,
// Devin Arand is +700 at 5. Sorting by sheet id puts Alex first; sorting by
// implied probability — what the app promises — puts Devin first. Asserting the
// full order would also pass if only the tie-break worked, so the two swapped
// names get their own assertion.
const WIN_TOURNAMENT_FAVOURITES_FIRST = [
  "Dan Mercer", // +110
  "Garrett Klenke", // +200
  "Ethan Kipping", // +400
  "Devin Arand", // +700  ← sheet order has this one AFTER Alex Leslie
  "Alex Leslie", // +900  ←
  "Pat Leicht", // +1200
  "Dustin Scheller", // +1500 ┐ tie, broken by sheet_pick_id
  "Mike Vemmer", // +1500 │
  "Rob Vemmer", // +1500 ┘
  "Jake Kohne", // +5000 ┐ tie
  "Steve Jones", // +5000 ┘
  "Field", // +10000
]

test("picks render favourites-first, not in sheet order (#105)", async ({ page }) => {
  // Read the card's visible text and rank the names by where they appear in it.
  // Deliberately not a DOM-structure assertion: what's under test is the order
  // a human reads down the card, which is exactly what #105 got wrong.
  const text = await page.getByTestId("bet-1").innerText()

  const positions = WIN_TOURNAMENT_FAVOURITES_FIRST.map((name) => ({
    name,
    at: text.indexOf(name),
  }))

  expect(positions.filter((p) => p.at === -1)).toEqual([])

  const renderedOrder = [...positions].sort((a, b) => a.at - b.at).map((p) => p.name)
  expect(renderedOrder).toEqual(WIN_TOURNAMENT_FAVOURITES_FIRST)

  // The discriminating pair, asserted on its own so a failure names the real
  // defect instead of dumping a twelve-item diff.
  expect(text.indexOf("Devin Arand")).toBeLessThan(text.indexOf("Alex Leslie"))
})

test("the stroke handicap is a badge beside the name, not part of it (#102)", async ({ page }) => {
  // Bet 7's picks carry handicaps: "Jake Kohne (E)", "Steve Jones (-5)",
  // "Mike Yenzer (-10)".
  await expect(page.getByTitle("Even strokes").first()).toBeVisible()
  await expect(page.getByTitle("-10 strokes").first()).toBeVisible()

  // The badge sits OUTSIDE the name: the golfer reads bare, the handicap is its
  // own element. Before #102 this rendered as the single string
  // "Mike Yenzer (-10)", so asserting the parenthetical is ABSENT from the
  // card's text is the assertion that actually pins the change.
  await expect(page.getByTitle("-10 strokes").first()).toHaveText("-10")

  const card = page.getByTestId("bet-7")
  await expect(card).toContainText("Mike Yenzer")
  await expect(card).not.toContainText("(-10)")
  await expect(card).not.toContainText("(E)")
})

test("the filter defaults to Open, all rounds (#104)", async ({ page }) => {
  // The status toggle only renders when the menu holds both kinds — the E2E
  // fixture is deliberately mixed (4 open, 9 closed) so it does.
  const open = page.getByRole("button", { name: "Open", exact: true })
  const closed = page.getByRole("button", { name: "Closed", exact: true })

  await expect(open).toHaveAttribute("aria-pressed", "true")
  await expect(closed).toHaveAttribute("aria-pressed", "false")

  await expect(page.getByRole("button", { name: "All Bet Rounds" })).toHaveAttribute(
    "aria-current",
    "true"
  )

  // One filter at a time: switching the view flips exactly one pressed state.
  await closed.click()
  await expect(closed).toHaveAttribute("aria-pressed", "true")
  await expect(open).toHaveAttribute("aria-pressed", "false")
})

test("a closed bet collapses its bettors behind a toggle (#103)", async ({ page }) => {
  await page.getByRole("button", { name: "Closed", exact: true }).click()

  // nonplayer@ has a seeded $5 wager on closed bet 5, so exactly one bettor is
  // revealed there. Everything about a closed bet is public.
  const card = page.getByTestId("bet-5")
  // Matches both states on purpose — the button's accessible name flips from
  // "Show" to "Hide", so a locator naming only one stops resolving after the
  // click and every later assertion fails as "element not found".
  const toggle = card.getByRole("button", { name: /(Show|Hide) 1 bettor\b/ })

  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAccessibleName(/Show 1 bettor\b/)
  await expect(toggle).toHaveAttribute("aria-expanded", "false")

  // Collapsed: the count and the money are on screen, the name is not.
  await expect(toggle).toHaveAccessibleName(/\$5/)
  await expect(card.getByText("Nina Nonplayer")).toHaveCount(0)

  await toggle.click()

  // Expanded: the name is now on screen. This is the reveal actually revealing,
  // not just a chevron rotating.
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
  await expect(toggle).toHaveAccessibleName(/Hide 1 bettor\b/)
  await expect(card.getByText("Nina Nonplayer")).toBeVisible()
})
