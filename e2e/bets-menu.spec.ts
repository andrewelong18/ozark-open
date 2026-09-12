// The bet menu, asserted on what's actually on screen.
//
// This spec exists because of #105. sortPicks ran server-side, the menu then
// re-sorted by sheet_pick_id and threw the result away, and it shipped: eleven
// passing unit tests, a green build, and nothing on the page. A journey that
// only checked the page loaded would have missed it too. So every assertion
// here reads rendered DOM — the order of names, the text of a badge, the
// aria-state of a toggle — never a server response or a database row.

import { expect, test } from "@playwright/test"

import { ACCOUNTS, signInAs, signOut } from "./fixtures/auth.ts"
import { buildMenuSheet } from "./fixtures/sheet.ts"

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

test("the menu opens on the phase the tournament is in (#193)", async ({ page }) => {
  // Both tabs ALWAYS render — that is the point of #193. The fixture's Phase 2
  // is `hidden`, which is what production looks like until Friday's upload, so
  // Phase 1 is where the tournament is and where the menu opens.
  const p1 = page.getByRole("button", { name: "Phase 1", exact: true })
  const p2 = page.getByRole("button", { name: "Phase 2", exact: true })

  await expect(p1).toHaveAttribute("aria-pressed", "true")
  await expect(p2).toHaveAttribute("aria-pressed", "false")
  // Both secondary rows open unfiltered — three radio groups, each with an
  // explicit "all" member (Pat, Sept 10).
  await expect(page.getByRole("button", { name: "All Rounds" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(
    page.getByRole("button", { name: "All Categories" })
  ).toHaveAttribute("aria-pressed", "true")

  // Phase 1 holds BOTH kinds at once — the state the old status toggle split
  // across two views and the reason this sprint had to badge every card.
  await expect(page.getByTestId("bet-1")).toContainText("Open")
  await expect(page.getByTestId("bet-5")).toContainText("Closed")

  // One tab at a time.
  await p2.click()
  await expect(p2).toHaveAttribute("aria-pressed", "true")
  await expect(p1).toHaveAttribute("aria-pressed", "false")
})

// ---------------------------------------------------------------------------
// The three filter levels (Pat, Sept 10 2026 — PRD §12 A23)
//
// The Phase 1 fixture is what makes these assertable, so it is worth spelling
// out: Tournament holds bet 1 (Top Finisher) and bet 2 (Top X Finisher);
// Round 1 holds bet 3 (Top Finisher), bets 4/6/8 (Match), bets 5/7 (Group
// Match) and bets 9-13 (Prop Bet). So "Tournament + Match" is empty and
// "Round 1 + Match" is exactly three bets — which is the pair this needs.
// ---------------------------------------------------------------------------

test("round and category filter independently, and compose (A23)", async ({
  page,
}) => {
  const round = page.getByRole("button", { name: "Round 1", exact: true })
  const category = page.getByRole("button", { name: "Match", exact: true })

  // Round alone: everything filed under Round 1, across every category.
  await round.click()
  await expect(round).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("bet-3")).toBeVisible() // Top Finisher
  await expect(page.getByTestId("bet-4")).toBeVisible() // Match
  await expect(page.getByTestId("bet-9")).toBeVisible() // Prop Bet
  await expect(page.getByTestId("bet-1")).toHaveCount(0) // Tournament

  // Now the category ON TOP of it — the round stays selected. Before Sept 10
  // this second click REPLACED the round, because only one facet could be
  // active at a time; that is the behaviour Pat rejected.
  await category.click()
  await expect(round).toHaveAttribute("aria-pressed", "true")
  await expect(category).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("bet-4")).toBeVisible()
  await expect(page.getByTestId("bet-6")).toBeVisible()
  await expect(page.getByTestId("bet-8")).toBeVisible()
  await expect(page.getByTestId("bet-3")).toHaveCount(0) // Round 1, wrong category
  await expect(page.getByTestId("bet-5")).toHaveCount(0) // Group Match ≠ Match

  // Each row is a radio group: picking another round leaves the category alone.
  await page.getByRole("button", { name: "Tournament", exact: true }).click()
  await expect(round).toHaveAttribute("aria-pressed", "false")
  await expect(category).toHaveAttribute("aria-pressed", "true")
})

test("an empty combination says which two chips emptied it (A23)", async ({
  page,
}) => {
  // The invariant #104 bought — no selectable option can empty the page — is
  // gone, knowingly, and this is the screen that pays for it. There is no
  // Tournament Match bet in Phase 1, both chips are legal, and the page has to
  // name BOTH of them: naming one would leave the reader to work out which row
  // did it, which is worse than naming neither.
  await page.getByRole("button", { name: "Tournament", exact: true }).click()
  await page.getByRole("button", { name: "Match", exact: true }).click()

  await expect(page.getByText("No bets match this filter")).toBeVisible()
  await expect(page.getByText(/Tournament.+\+.+Match/)).toBeVisible()
  await expect(page.getByTestId("bet-1")).toHaveCount(0)

  // ...and the one tap that undoes both.
  await page.getByRole("button", { name: "Show all Phase 1 bets" }).click()
  await expect(
    page.getByRole("button", { name: "All Rounds" })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    page.getByRole("button", { name: "All Categories" })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("bet-1")).toBeVisible()
})

test("the category survives a phase flip; the round does not (A23)", async ({
  page,
}) => {
  // Round 1 is a Phase 1 round and Round 3 a Phase 2 one, so a round selection
  // essentially never survives the tab change — it resets rather than leaving a
  // selection that matches nothing. All five categories exist in both phases,
  // so a member who has drilled into Match stays in Match.
  await page.getByRole("button", { name: "Round 1", exact: true }).click()
  await page.getByRole("button", { name: "Match", exact: true }).click()

  await page.getByRole("button", { name: "Phase 2", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "All Rounds" })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    page.getByRole("button", { name: "Match", exact: true })
  ).toHaveAttribute("aria-pressed", "true")

  // Phase 2 offers Round 3 and never Round 1 — the row is scoped to the phase.
  await expect(
    page.getByRole("button", { name: "Round 3", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Round 1", exact: true })
  ).toHaveCount(0)
})

test("an unpublished Phase 2 says so instead of vanishing (#193)", async ({ page }) => {
  // Pat's words: "if phase 2 bets are hidden, then just say that phase 2 isn't
  // open yet." The tab is present and selectable; behind it is a sentence, not
  // an empty page and not a missing control.
  await page.getByRole("button", { name: "Phase 2", exact: true }).click()

  // Leads with the fact — there are no bets here — and then explains why, so it
  // reads as a state rather than a failure.
  // getByText, not getByRole("heading") — EmptyState's title is a styled <div>,
  // so there is no heading role to match.
  await expect(page.getByText("No bets in Phase 2 yet")).toBeVisible()
  await expect(page.getByText(/Phase 2 isn.t open yet/)).toBeVisible()
  await expect(page.getByTestId("bet-20")).toHaveCount(0)
  // The badge beside the toggle agrees with the body.
  await expect(page.getByText("Not open yet")).toBeVisible()

  // And it offers the obvious next tap rather than leaving you on a dead tab.
  const back = page.getByRole("button", { name: "See Phase 1 instead" })
  await expect(back).toBeVisible()
  await back.click()
  await expect(
    page.getByRole("button", { name: "Phase 1", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("bet-1")).toBeVisible()
})

test("opening Phase 2 by upload brings the tab to life (#193)", async ({ page }) => {
  // The other half of the state, reached the only way the app allows — a
  // re-upload through /admin/import, the same move results-and-reveal makes to
  // close a bet. Reaching into the database would test a state the app can't
  // produce.
  const sheet = await buildMenuSheet([{ betIds: [20, 21], status: "open" }])

  await signOut(page)
  await signInAs(page, ACCOUNTS.admin)
  await page.goto("/admin/import")
  await page.locator("#import-file").setInputFiles(sheet)
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page.getByText("Import Report")).toBeVisible()

  await signOut(page)
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")

  // Phase 2 is now where the tournament is, so the menu opens there by itself.
  await expect(
    page.getByRole("button", { name: "Phase 2", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("bet-20")).toBeVisible()
  await expect(page.getByText(/Phase 2 isn.t open yet/)).toHaveCount(0)

  // Put it back, so this spec can run twice and the file stays order-independent.
  const reset = await buildMenuSheet([{ betIds: [20, 21], status: "hidden" }])
  await signOut(page)
  await signInAs(page, ACCOUNTS.admin)
  await page.goto("/admin/import")
  await page.locator("#import-file").setInputFiles(reset)
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page.getByText("Import Report")).toBeVisible()
})

test("a closed bet collapses its bettors behind a toggle (#103)", async ({ page }) => {
  // No navigation needed since #193: closed bet 5 is a Phase 1 bet and Phase 1
  // is the default tab, so it is already on screen beside the open ones.
  //
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
