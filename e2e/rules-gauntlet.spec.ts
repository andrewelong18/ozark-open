// The §7 money rules, fired by hand through the real UI.
//
// This spec exists because of one paragraph in docs/dry-run/ISSUE_LOG.md:
//
//   "The §7 money rules were never fired by hand. They pass 186 unit tests and
//    every seeded wager validated cleanly, but the following were not exercised
//    through the real UI — meaning the error strings, the two-tap confirm, the
//    toasts and the edit/remove/revive path are unverified against a human."
//
// Act 4's slates were filled in by fallback SQL instead of placed in a browser,
// so the rules below have never refused anything in front of a person. Each one
// fails QUIETLY when it's wrong — no crash, just a wager that should not exist
// or one that should. That is the worst shape a bug can have here, because the
// rows are money and September has no undo beyond a snapshot.
//
// Every assertion reads the DOM, with one stated exception (the revive test —
// row identity has no rendering). The messages are asserted verbatim: a rule
// that refuses for the wrong stated reason is a support call at 11pm, and the
// text is the whole product at that moment.

import { expect, type Page } from "@playwright/test"
import { test } from "@playwright/test"

import { ACCOUNTS, deletePlacementsFor, reloadFixture, signInAs } from "./fixtures/auth.ts"
import {
  createPhase2SelfBet,
  dropPhase2SelfBet,
  linkPickToUser,
  pickIdFor,
  placementRowsFor,
  restoreEntries,
  seedWager,
  setEntryFee,
  unlinkAllPicks,
} from "./fixtures/rules.ts"

/** approved@'s seeded entry per phase, restored after each test that moves it. */
const SEEDED_ENTRY = 30

/** A pick's row, found by its name as TEXT. The gauntlet unlinks every pick in
 * beforeEach, and an unlinked label stopped being a button with the radio it
 * used to stand in for (#162). */
function stakeRow(page: Page, betTestId: string, pickName: string) {
  return page
    .getByTestId(betTestId)
    .locator("div")
    .filter({ has: page.getByText(pickName, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Place stake" }) })
    .last()
}

/**
 * Every pick carries its own stake box, in every category — since #162 there is
 * no radio to select first, and a pick-one bet expresses its rule by disabling
 * the OTHER rows once a wager exists. So staging is the same three steps
 * everywhere: type, ↵, confirm.
 */
async function stage(
  page: Page,
  betTestId: string,
  pickName: string,
  amount: string
) {
  const row = stakeRow(page, betTestId, pickName)
  // A disabled box means a wager already sits on another pick of a pick-one
  // bet. fill() would time out on it; say why instead.
  await expect(
    row.getByRole("textbox"),
    `${pickName}'s stake box is disabled — another pick of this bet holds the wager`
  ).toBeEnabled()
  await row.getByRole("textbox").fill(amount)
  await row.getByRole("button", { name: "Place stake" }).click()
}

/** Stage, then take the second tap. The confirm label differs on an edit. */
async function placeAndConfirm(
  page: Page,
  betTestId: string,
  pickName: string,
  amount: string
) {
  await stage(page, betTestId, pickName, amount)
  const confirm = page.getByRole("button", { name: /^Confirm (bet|change)$/ })
  await confirm.click()
}

/** The server's refusal, scoped past Next's empty route-announcer alert. */
function refusal(page: Page, fragment: string) {
  return page.getByRole("alert").filter({ hasText: fragment })
}

test.beforeEach(async () => {
  // Start from the fixture, not from whatever ran before. These tests move the
  // menu itself — pick→player links, entry fees, a synthetic Phase 2 bet — and
  // they run last in the suite, downstream of specs that close bets and publish
  // results. Rebuilding here is what makes them mean the same thing run alone
  // and run ninth.
  reloadFixture()
  dropPhase2SelfBet()
  unlinkAllPicks()
  await deletePlacementsFor(ACCOUNTS.approved)
  await restoreEntries(ACCOUNTS.approved, SEEDED_ENTRY, SEEDED_ENTRY)
})

test.afterAll(async () => {
  // The gauntlet mutates the menu itself (links, a synthetic Phase 2 bet), so
  // it puts the fixture back rather than leaving the next spec to inherit it.
  dropPhase2SelfBet()
  unlinkAllPicks()
  reloadFixture()
  await restoreEntries(ACCOUNTS.approved, SEEDED_ENTRY, SEEDED_ENTRY)
})

// ---------------------------------------------------------------------------
// 4.5 — the max single bet. Since Sprint 30 (ADR 0002): a flat $10.
// ---------------------------------------------------------------------------

test("the max single bet is a flat $10: at a $50 entry $11 is refused and $10 is not", async ({
  page,
}) => {
  // $50 is the entry where the OLD rule (50% of the entry, capped at $20) and
  // the new flat $10 disagree most — the old code would take $20 here. So a
  // regression to a percentage fails this test loudly instead of passing at
  // an entry where the two happen to agree.
  await setEntryFee(ACCOUNTS.approved, 50)
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")

  await placeAndConfirm(page, "bet-1", "Dan Mercer", "11")

  const alert = refusal(page, "Max single bet")
  await expect(alert).toBeVisible()
  await expect(alert).toContainText("Max single bet is $10.")

  // Refused means nothing was written — not "written and hidden".
  await page.goto("/my-bets")
  await expect(page.getByText("Dan Mercer")).toHaveCount(0)

  // And the dollar below it goes through, which is what makes the assertion
  // above about the cap rather than about the rule being off by one.
  await page.goto("/bets")
  await placeAndConfirm(page, "bet-1", "Dan Mercer", "10")
  await expect(page.getByText("Locked in")).toBeVisible()

  await page.goto("/my-bets")
  await expect(page.getByText("Dan Mercer")).toBeVisible()
})

// ---------------------------------------------------------------------------
// 4.7 — the self-bet cap, PER PHASE (Sprint 30)
// ---------------------------------------------------------------------------

test("the self-bet cap counts each phase on its own, and floors", async ({ page }) => {
  // $40 in each phase → a quarter of that, $10 on yourself, in EACH phase.
  //
  // The two self-picks sit in DIFFERENT phases on purpose. Inside one phase a
  // per-phase implementation and a tournament-wide one are indistinguishable.
  // Under the old tournament-wide cap $6 + $5 = $11 was refused; under Pat's
  // per-phase rule it's $6 of $10 in Phase 1 and $5 of $10 in Phase 2, and a
  // regression back to one cap fails the placement below.
  await setEntryFee(ACCOUNTS.approved, 40, 1)
  await setEntryFee(ACCOUNTS.approved, 40, 2)
  await linkPickToUser(1, ACCOUNTS.approved) // Phase 1, bet 1 — "Dan Mercer"
  await createPhase2SelfBet(ACCOUNTS.approved) // Phase 2, bet 900 — pick 900
  await seedWager(ACCOUNTS.approved, 1, 6) // $6 on himself, Phase 1

  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")

  await placeAndConfirm(page, "bet-900", "Avery Approved", "5")
  await expect(page.getByTestId("bet-900").getByText("✓ Locked in")).toBeVisible()

  // Now the floor, in Phase 2 alone. At a $25 Phase 2 entry the cap is a
  // quarter of $25 = $6.25 → $6, so moving his $5 to $7 is one dollar over
  // and the Phase 1 $6 plays no part in the sentence.
  await setEntryFee(ACCOUNTS.approved, 25, 2)
  await page.goto("/bets")
  await placeAndConfirm(page, "bet-900", "Avery Approved", "7")

  const alert = refusal(page, "Max total on yourself")
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(
    "Max total on yourself is $6 for your $25 Phase 2 entry — this would put you at $7."
  )

  // Landing exactly on the cap is allowed — the rule is >, not >=.
  await page.goto("/bets")
  await placeAndConfirm(page, "bet-900", "Avery Approved", "6")
  await expect(page.getByTestId("bet-900").getByText("✓ Locked in")).toBeVisible()

  // Scoped to main: the bettor's own name is also in the header, and a
  // self-pick is the one case where the pick label and the signed-in member
  // are the same string.
  await page.goto("/my-bets")
  await expect(page.getByRole("main").getByText("Avery Approved")).toBeVisible()
})

// ---------------------------------------------------------------------------
// Sprint 30 — the running total is per phase, and so is eligibility
// ---------------------------------------------------------------------------

test("the running total is capped at the PHASE entry, with the database's own sentence", async ({
  page,
}) => {
  // $30 Phase 1 entry, $30 of it already down on three bets. One more dollar
  // anywhere in Phase 1 is over — and the refusal names the phase.
  await seedWager(ACCOUNTS.approved, 2, 10) // bet 1, Garrett Klenke
  await seedWager(ACCOUNTS.approved, 24, 10) // bet 3, Garrett Klenke
  await seedWager(ACCOUNTS.approved, 46, 10) // bet 8, Brendan Nulsen

  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")
  await placeAndConfirm(page, "bet-1", "Dan Mercer", "1")

  const alert = refusal(page, "Over your")
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(
    "Over your $30 Phase 1 entry — that's the most you can wager in Phase 1."
  )

  // Phase 1 being full takes nothing from Phase 2: its own $30 is untouched.
  await createPhase2SelfBet(ACCOUNTS.admin) // a Phase 2 bet approved@ isn't in
  await page.goto("/bets")
  await placeAndConfirm(page, "bet-900", "Avery Approved", "10")
  await expect(page.getByTestId("bet-900").getByText("✓ Locked in")).toBeVisible()
})

test("a phase you have no entry for has no stake box, and the API refuses it by name", async ({
  page,
}) => {
  await setEntryFee(ACCOUNTS.approved, null, 2)
  await createPhase2SelfBet(ACCOUNTS.admin)

  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")

  // The Phase 2 bet renders read-only, and says why in the member's terms.
  const card = page.getByTestId("bet-900")
  await expect(card).toContainText("You're not entered in Phase 2")
  await expect(card.getByRole("button", { name: "Place stake" })).toHaveCount(0)

  // The UI isn't the gate — the route is. A hand-built request from the same
  // session is refused with the same sentence, and nothing is written.
  const response = await page.request.post("/api/placements", {
    data: { pick_id: pickIdFor(900), amount: 5 },
  })
  expect(response.status()).toBe(403)
  expect((await response.json()).error).toBe(
    "You're not entered in Phase 2 — ask an admin if you'd like to be."
  )
  expect(await placementRowsFor(ACCOUNTS.approved, 900)).toHaveLength(0)

  // Phase 1 is still theirs. The menu opens on the phase being closed next —
  // Phase 2, now that a Phase 2 bet is published — so switch tabs first.
  await page.getByRole("button", { name: "Phase 1", exact: true }).click()
  await expect(
    page.getByTestId("bet-1").getByRole("button", { name: "Place stake" }).first()
  ).toBeVisible()
})

// ---------------------------------------------------------------------------
// 4.10 — the opponent block, on a stroke-suffixed label
// ---------------------------------------------------------------------------

test("a player can't back his opponent in a match he's in, stroke suffix and all", async ({
  page,
}) => {
  // Bet 7 is a Group Match: "Jake Kohne (E)", "Steve Jones (-5)", "Mike Yenzer
  // (-10)". Link the bettor to Jake's pick and he is now IN this match.
  //
  // The stroke suffix is the point. Since #102 the label renders as a name plus
  // a separate badge, so the row reads "Steve Jones" with "-5" beside it. If
  // display and matching ever diverge, the pick stops linking to its player and
  // this block silently stops applying — which is why the opponent here is a
  // suffixed pick and not the bare one.
  await linkPickToUser(43, ACCOUNTS.approved) // "Jake Kohne (E)" → the bettor
  await linkPickToUser(44, ACCOUNTS.admin) // "Steve Jones (-5)" → someone else

  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")

  await placeAndConfirm(page, "bet-7", "Steve Jones", "5")

  const alert = refusal(page, "opponent")
  await expect(alert).toBeVisible()
  await expect(alert).toContainText("You can't bet on your opponent in a match you're playing in.")

  await page.goto("/my-bets")
  await expect(page.getByText("Steve Jones")).toHaveCount(0)

  // Backing HIMSELF in the same match is fine — the rule blocks opponents, not
  // participation. $5 is under the $7 self cap on a $30 entry.
  await page.goto("/bets")
  await placeAndConfirm(page, "bet-7", "Jake Kohne", "5")
  await expect(page.getByText("Locked in")).toBeVisible()
})

// ---------------------------------------------------------------------------
// 4.13 — remove, then re-place
// ---------------------------------------------------------------------------

test("removing then re-placing revives the one row instead of making a second", async ({
  page,
}) => {
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")

  await placeAndConfirm(page, "bet-1", "Dan Mercer", "5")
  await expect(page.getByText("Locked in")).toBeVisible()

  const [original] = await placementRowsFor(ACCOUNTS.approved, 1)
  expect(original).toBeTruthy()

  await page.goto("/bets")
  await page.getByTestId("bet-1").getByRole("button", { name: /Remove bet/ }).click()
  await page.getByRole("button", { name: "Remove bet", exact: true }).click()

  await page.goto("/my-bets")
  await expect(page.getByText("Dan Mercer")).toHaveCount(0)

  await page.goto("/bets")
  await placeAndConfirm(page, "bet-1", "Dan Mercer", "7")
  await expect(page.getByText("Locked in")).toBeVisible()

  await page.goto("/my-bets")
  await expect(page.getByText("Dan Mercer")).toBeVisible()

  // The one database assertion in this file, and it earns the exception: a
  // revived row and a freshly-inserted second row render identically, so the
  // DOM cannot tell them apart. What's being protected is the money history —
  // placements are soft-deleted precisely so a wager keeps its past, and a
  // duplicate row would split that history in two while looking fine.
  const rows = await placementRowsFor(ACCOUNTS.approved, 1)
  expect(rows).toHaveLength(1)
  expect(rows[0].id).toBe(original.id)
  expect(rows[0].deleted).toBe(false)
  expect(rows[0].amount).toBe(7)
})

// ---------------------------------------------------------------------------
// 4.14 — §7.7 one pick per Match / Group Match, as the rows now show it (#162)
// ---------------------------------------------------------------------------

test("a wager on a pick-one bet disables its siblings until it's removed", async ({
  page,
}) => {
  // Bet 7 is a Group Match. Nothing is linked to anyone here, so the opponent
  // block is out of the way and the only rule in play is one-pick-per-bet.
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/bets")

  const card = page.getByTestId("bet-7")
  const jake = stakeRow(page, "bet-7", "Jake Kohne").getByRole("textbox")
  const steve = stakeRow(page, "bet-7", "Steve Jones").getByRole("textbox")

  // Every pick is offerable to start with — no selection step (#162), and no
  // card-wide dead zone (#161, which killed all three at once).
  await expect(jake).toBeEnabled()
  await expect(steve).toBeEnabled()

  await placeAndConfirm(page, "bet-7", "Jake Kohne", "5")
  await expect(card.getByText("✓ Locked in")).toBeVisible()

  // The wager holds the bet. Its own row stays editable — an edit is a change
  // of amount, not a second pick — and the siblings go grey with the reason
  // stated, rather than refusing a tap after the fact.
  await expect(jake).toBeEnabled()
  await expect(steve).toBeDisabled()
  await expect(
    card.getByText("Pick one · Remove your $5 on Jake Kohne (E) to switch picks")
  ).toBeVisible()

  // Removing hands the bet back.
  await card.getByRole("button", { name: /Remove bet/ }).click()
  await page.getByRole("button", { name: "Remove bet", exact: true }).click()
  await expect(card.getByText("✓ Locked in")).toHaveCount(0)
  await expect(steve).toBeEnabled()

  // And the switch the disabling was protecting now goes through.
  await placeAndConfirm(page, "bet-7", "Steve Jones", "5")
  await expect(card.getByText("✓ Locked in")).toBeVisible()
  await page.goto("/my-bets")
  await expect(page.getByText("Steve Jones")).toBeVisible()
  await expect(page.getByText("Jake Kohne")).toHaveCount(0)
})
