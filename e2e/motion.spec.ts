// The one spec that runs with motion ENABLED.
//
// WHY THIS EXISTS. playwright.config.ts sets `reducedMotion: "reduce"` globally,
// which is right for the other specs — the mobile geometry tests measure real
// positions and an in-flight entrance makes them flaky — but it means the whole
// suite would otherwise never execute an animation. That matters here more than
// it usually would, because Sprint 12's motion system contains one construct
// that can fail in a way no build or type check catches:
//
//   an element that removes itself only once its animation reports finished.
//
// BetErrorToast latches its message so it can outlive the prop that fed it, and
// unmounts on `animationend`. If the exit animation ever stops running — a
// regression in the reduced-motion floor from 0.01ms to `animation: none`, a
// dropped fill-mode, a renamed utility — the event never fires and the toast
// stays on screen forever, on top of the bet slip, on the one page that matters
// during the tournament. The failure is silent: the toast still APPEARS, it just
// never leaves.
//
// So this file asserts the boring half nobody writes: that the thing goes away.
//
// WHAT IT ACTUALLY CATCHES — measured, not assumed. The toast has two
// independent protections: the reduced-motion floor in app/globals.css keeps a
// real animation running (0.01ms, not `none`, so animationend still fires), and
// the card carries its own EXIT_FALLBACK_MS timer. This spec was run against
// three sabotaged builds to find out what it is worth:
//
//   floor → `animation: none`, fallback intact ....... still passes
//   fallback removed, floor intact .................. still passes
//   BOTH removed .................................... `reduce` branch FAILS
//
// That is defence in depth working as intended, and it is the honest reading of
// this spec: it does not guard the floor specifically, it guards the OUTCOME —
// the toast leaves. It fails the moment nothing is left holding that up, which
// is the only moment anyone cares. It also catches the plainer regressions: a
// broken latch, a mis-wired dismiss, a data-state typo.
//
// Both branches are covered because they exit by different mechanisms —
// `no-preference` through a real animation, `reduce` through the floor.

import { expect, test, type Page } from "@playwright/test"

import { ACCOUNTS, deletePlacementsFor, signInAs } from "./fixtures/auth.ts"
import { setEntryFee } from "./fixtures/rules.ts"

// Matches the gauntlet's helper: scope past Next's empty route-announcer alert.
function refusal(page: Page, fragment: string) {
  return page.getByRole("alert").filter({ hasText: fragment })
}

/** Stake an amount the §7 rules must refuse, so the error toast appears. */
async function provokeToast(page: Page) {
  await page.goto("/bets")
  const row = page
    .getByTestId("bet-1")
    .locator("div")
    .filter({ has: page.getByText("Dan Mercer", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Place stake" }) })
    .last()
  // $13 against a $25 entry trips the max-single-bet floor (0.5 × 25 = 12.5 →
  // $12). Borrowed from e2e/rules-gauntlet.spec.ts, which proves the rule
  // itself; here the refusal is only a way to summon the toast.
  await row.getByRole("textbox").fill("13")
  await row.getByRole("button", { name: "Place stake" }).click()
  await page.getByRole("button", { name: /^Confirm bet$/ }).click()
}

// The seeded entry fee, which every other spec assumes. This file lowers it to
// provoke a refusal and MUST put it back: specs share one database and run in
// filename order, so "motion" lands before "placement", and leaving the fee at
// $25 fails placement.spec.ts on an assertion about "$30 entry" that has
// nothing to do with motion. (It did, on the first full run.)
const SEEDED_ENTRY = 30

test.beforeEach(async () => {
  await deletePlacementsFor(ACCOUNTS.approved)
  await setEntryFee(ACCOUNTS.approved, 25)
})

test.afterAll(async () => {
  await deletePlacementsFor(ACCOUNTS.approved)
  await setEntryFee(ACCOUNTS.approved, SEEDED_ENTRY)
})

for (const motion of ["no-preference", "reduce"] as const) {
  test.describe(`with prefers-reduced-motion: ${motion}`, () => {
    test.use({ contextOptions: { reducedMotion: motion } })

    test("the bet error toast appears, and then actually leaves the DOM", async ({
      page,
    }) => {
      await signInAs(page, ACCOUNTS.approved)
      await provokeToast(page)

      const toast = refusal(page, "Max single bet")
      await expect(toast).toBeVisible()

      // Dismissing clears the prop in BetsMenu. Everything after this line is
      // the latch doing its job: the card outlives the prop, plays its exit,
      // and takes itself out on animationend.
      await toast.getByRole("button", { name: "Dismiss" }).click()

      // toHaveCount(0) is the assertion that matters — not toBeHidden(). A
      // stranded toast is still VISIBLE; the bug is that it is still THERE.
      await expect(toast).toHaveCount(0, { timeout: 5_000 })
    })
  })
}

test.describe("with prefers-reduced-motion: no-preference", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } })

  test("the toast auto-dismisses on its own timer too", async ({ page }) => {
    // The 5s timer is the path a user takes when they ignore the message
    // rather than tapping ✕ — the commonest one, and it runs the same exit.
    await signInAs(page, ACCOUNTS.approved)
    await provokeToast(page)

    const toast = refusal(page, "Max single bet")
    await expect(toast).toBeVisible()
    await expect(toast).toHaveCount(0, { timeout: 12_000 })
  })
})

// ---------------------------------------------------------------------------
// The bet-menu filter swap. This is the regression guard for a bug that was
// designed OUT rather than fixed: the obvious way to replay the list entrance
// is a `key` on the container, which remounts every BetPlacementCard and
// silently discards a typed-but-unplaced stake. The flip-flop in bets-menu.tsx
// exists precisely so this test can pass.
// ---------------------------------------------------------------------------
test.describe("filter swap", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } })

  test("changing a filter replays the list without discarding a typed stake", async ({
    page,
  }) => {
    await signInAs(page, ACCOUNTS.approved)
    await page.goto("/bets")

    // Narrow to one round first, then widen back to "All Bet Rounds". Widening
    // is the direction that cannot filter the card away, whichever round the
    // fixture happens to put it in — a specific tab would depend on the sheet.
    const tabs = page.getByRole("button", { name: /^(R[123]|Tournament)$/ })
    if ((await tabs.count()) === 0) test.skip(true, "no round tab strip in this fixture")
    await tabs.first().click()

    const list = page.locator("[data-swap]")
    await expect(list).toHaveCount(1)

    // Whatever bet this round shows, as long as it takes a stake.
    const field = page.getByRole("textbox").first()
    await expect(field).toBeVisible()
    await field.fill("7")
    await expect(field).toHaveValue("7")

    const before = await list.getAttribute("data-swap")
    await page.getByRole("button", { name: "All Bet Rounds", exact: true }).click()

    // The container flipped, so the entrance replayed…
    await expect(list).not.toHaveAttribute("data-swap", before!)
    // …and the card did not remount, so the stake is still typed. A `key` on
    // the container fails exactly here.
    await expect(field).toHaveValue("7")
  })
})

// ---------------------------------------------------------------------------
// The route fade wraps <main>, and the bet slip is position: fixed inside it.
// An ancestor running a TRANSFORM animation becomes a containing block for
// fixed descendants, which would peel the bar off the viewport for the duration
// of every navigation — on the page that matters most, on the device it is read
// on. RouteFade animates opacity only for exactly this reason; this asserts it,
// mid-flight rather than after, because after is when it looks fine again.
// ---------------------------------------------------------------------------
test.describe("route fade", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } })

  test("the fixed bet slip stays pinned to the viewport during the entrance", async ({
    page,
  }) => {
    await signInAs(page, ACCOUNTS.approved)
    await page.goto("/dashboard")
    await page.getByRole("link", { name: "Bet Menu" }).click()
    await page.waitForURL("**/bets")

    // The fixed element is the <aside> that HOLDS the toast slot, not a div.
    const bar = page.locator("aside").filter({ has: page.locator("#bet-footer-toast") })
    await expect(bar).toHaveCount(1)

    // Sampled while the 320ms entrance is still running.
    const viewport = page.viewportSize()!
    const box = (await bar.boundingBox())!
    const bottomGap = viewport.height - (box.y + box.height)
    console.log(`bet slip bottom gap mid-entrance: ${bottomGap}px`)

    // Pinned means it sits at the bottom of the VIEWPORT. If an ancestor
    // transform had made itself the containing block, the bar would be
    // positioned against that box instead and this gap would be large.
    expect(Math.abs(bottomGap)).toBeLessThan(4)
  })
})
