// The placement celebration (Sprint 12, #164) — the card that pops on a
// confirmed wager, plays the clip, and leaves on its own.
//
// What is worth testing here is NOT "does it look good". It is the three ways
// this feature could quietly ruin the betting page:
//
//   1. It never leaves, and sits over the menu forever.
//   2. It eats a tap, and the bettor can't place their next wager. This is
//      also how it would take four existing specs down with it — every one of
//      placement / rules-gauntlet / on-behalf / mobile-journey clicks again
//      inside the ~2s the card is up, and Playwright's actionability check
//      fails on an overlay that could intercept.
//   3. It turns into a video player — controls, or worse, fullscreen on iOS.
//
// Audio is deliberately never asserted. Chromium refuses audible autoplay
// under test, the component falls back to muted by design, and a test that
// depended on sound would be flaky in exactly the case the fallback exists to
// handle. What is asserted is that the clip plays at all.
//
// Runs with reducedMotion: "no-preference" the way motion.spec.ts does — the
// suite-wide default is "reduce", which collapses the enter/exit to 0.01ms and
// would make the timing assertions meaningless.

import { expect, type Page } from "@playwright/test"
import { test } from "@playwright/test"

import { ACCOUNTS, deletePlacementsFor, signInAs } from "./fixtures/auth.ts"

const card = (page: Page) => page.getByTestId("bet-celebration")

/** Same row helper the placement spec uses — the stake box on a pick, found by
 * the pick's name as text. */
function stakeRow(page: Page, betTestId: string, pickName: string) {
  return page
    .getByTestId(betTestId)
    .locator("div")
    .filter({ has: page.getByText(pickName, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Place stake" }) })
    .last()
}

async function stage(page: Page, betTestId: string, pickName: string, amount: string) {
  const row = stakeRow(page, betTestId, pickName)
  await row.getByRole("textbox").fill(amount)
  await row.getByRole("button", { name: "Place stake" }).click()
}

test.describe("placement celebration", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } })

  test.beforeEach(async ({ page }) => {
    await deletePlacementsFor(ACCOUNTS.approved)
    await signInAs(page, ACCOUNTS.approved)
    await page.goto("/bets")
    await expect(page.getByRole("heading", { name: "Bet Menu" })).toBeVisible()
  })

  // THE REGRESSION. This shipped broken: the clip played and nothing appeared.
  //
  // BetsMenu renders inside `<div data-enter-stagger>` on /bets, and that
  // column runs `rise-in`, which animates a transform. A transformed element
  // becomes the containing block for its `position: fixed` descendants, so
  // `fixed inset-0` sized itself to the full height of the bet menu instead of
  // the viewport and centred the card roughly 1400px below the fold. Measured
  // in a reproduction: the overlay came out 3125px tall against a ~700px
  // viewport. Chrome happened to hide it; Safari did not.
  //
  // Every assertion below is written so it fails on the ORIGINAL bug, and none
  // of them depends on knowing the mechanism — the last one is just "can a
  // human see it", which is the part that actually went wrong.
  test("the card is actually on screen — not centred inside the bet menu", async ({
    page,
  }) => {
    await stage(page, "bet-1", "Dan Mercer", "10")
    await page.getByRole("button", { name: "Confirm bet" }).click()
    await expect(card(page)).toHaveAttribute("data-state", "open")

    // 1. It is portalled out of the menu. Anything else and an ancestor's
    //    transform, filter, overflow or stacking context can reach it.
    const parentIsBody = await card(page).evaluate(
      (el) => el.parentElement === document.body
    )
    expect(parentIsBody).toBe(true)

    // 2. `fixed inset-0` means the VIEWPORT, and this is the measurement that
    //    caught it: hijacked, the overlay is as tall as the scrollable menu.
    const box = await card(page).evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { h: Math.round(r.height), vh: window.innerHeight }
    })
    expect(box.h).toBe(box.vh)

    // 3. The one that needs no theory: the card the bettor is supposed to see
    //    intersects the viewport.
    const visible = await card(page)
      .locator("video")
      .evaluate((el) => {
        const r = el.getBoundingClientRect()
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.top < window.innerHeight &&
          r.bottom > 0 &&
          r.left < window.innerWidth &&
          r.right > 0
        )
      })
    expect(visible).toBe(true)
  })

  test("opens on a confirmed wager and closes itself, with no click", async ({
    page,
  }) => {
    // At rest before anything happens: mounted (it must be — the <video> can
    // never unmount without losing its gesture unlock) but idle.
    await expect(card(page)).toHaveAttribute("data-state", "idle")

    await stage(page, "bet-1", "Dan Mercer", "10")
    await page.getByRole("button", { name: "Confirm bet" }).click()

    await expect(card(page)).toHaveAttribute("data-state", "open")

    // The whole point: it returns to rest on its own. Nothing below this line
    // touches the page. 6s covers the 1.65s clip, the 3s hold fallback if
    // `ended` never fires, and the exit.
    await expect(card(page)).toHaveAttribute("data-state", "idle", {
      timeout: 6000,
    })
  })

  test("the clip actually plays", async ({ page }) => {
    await stage(page, "bet-1", "Dan Mercer", "10")
    await page.getByRole("button", { name: "Confirm bet" }).click()
    await expect(card(page)).toHaveAttribute("data-state", "open")

    // currentTime advancing is the only honest proof the video is running.
    // A poster frame on a paused element would satisfy any visual assertion.
    await expect
      .poll(
        () =>
          card(page)
            .locator("video")
            .evaluate((v: HTMLVideoElement) => v.currentTime),
        { timeout: 4000 }
      )
      .toBeGreaterThan(0)
  })

  test("never intercepts a pointer event while it is up", async ({ page }) => {
    await stage(page, "bet-1", "Dan Mercer", "10")
    await page.getByRole("button", { name: "Confirm bet" }).click()
    await expect(card(page)).toHaveAttribute("data-state", "open")

    // With the card open and centred, ask the browser what is actually under
    // the middle of the viewport. If any part of the celebration answers, it
    // is intercepting — pointer-events-none has been lost somewhere in the
    // tree and the next tap goes to the overlay instead of the menu.
    const swallowed = await page.evaluate(() => {
      const el = document.elementFromPoint(
        window.innerWidth / 2,
        window.innerHeight / 2
      )
      return el?.closest('[data-testid="bet-celebration"]') != null
    })
    expect(swallowed).toBe(false)

    // And the real consequence, not just the theory: a control on the row
    // underneath is still clickable while the card is open. Playwright's
    // actionability check does the work — this fails on an intercepting
    // overlay before the click ever lands.
    await expect(card(page)).toHaveAttribute("data-state", "open")
    await page
      .getByTestId("bet-1")
      .getByRole("button", { name: /Remove bet/ })
      .click()
    await expect(
      page.getByRole("button", { name: "Remove bet", exact: true })
    ).toBeVisible()
  })

  test("is a flourish, not a video player", async ({ page }) => {
    const video = card(page).locator("video")

    // No controls: no scrubber, no play button, no context menu.
    await expect(video).not.toHaveAttribute("controls", /.*/)
    // playsinline is the one that matters most — without it iOS Safari takes
    // the clip fullscreen over the whole app.
    await expect(video).toHaveAttribute("playsinline", /.*/)
    await expect(video).not.toHaveAttribute("loop", /.*/)

    // pointer-events must be none on the element itself, not merely on an
    // ancestor: that is what kills tap-to-pause and the media context menu.
    await expect(video).toHaveCSS("pointer-events", "none")
  })

  test("fires on an edited stake, and never on a removal", async ({ page }) => {
    await stage(page, "bet-1", "Dan Mercer", "10")
    await page.getByRole("button", { name: "Confirm bet" }).click()
    await expect(card(page)).toHaveAttribute("data-state", "open")
    await expect(card(page)).toHaveAttribute("data-state", "idle", {
      timeout: 6000,
    })

    // An edit is still money moving, so it still celebrates.
    await stage(page, "bet-1", "Dan Mercer", "12")
    await page.getByRole("button", { name: "Confirm change" }).click()
    await expect(card(page)).toHaveAttribute("data-state", "open")
    await expect(card(page)).toHaveAttribute("data-state", "idle", {
      timeout: 6000,
    })

    // Taking a wager off is not a win. Removing must stay silent.
    await page
      .getByTestId("bet-1")
      .getByRole("button", { name: /Remove bet/ })
      .click()
    await page.getByRole("button", { name: "Remove bet", exact: true }).click()
    await expect(page.getByText("Locked in")).toHaveCount(0)
    await expect(card(page)).toHaveAttribute("data-state", "idle")
  })

  test("a rejected wager does not celebrate", async ({ page }) => {
    // $16 is over the §7 max single bet ($15 on a $30 entry) — the server
    // refuses it. onPlaced fires on the API's confirmation, never the click,
    // and this is the assertion that keeps it that way.
    await stage(page, "bet-1", "Dan Mercer", "16")
    await page.getByRole("button", { name: "Confirm bet" }).click()

    await expect(
      page.getByRole("alert").filter({ hasText: "Max single bet" })
    ).toBeVisible()
    await expect(card(page)).toHaveAttribute("data-state", "idle")
  })
})
