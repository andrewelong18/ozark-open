// Screenshots of the surfaces Sprint 9's mobile pass changed, at phone width.
//
// Not an assertion — a camera. The geometry specs (mobile-layout.spec.ts) can
// tell you a control is 44px and that nothing overflows; they cannot tell you
// the card now reads as a wall of stacked text, or that a chip row grew into a
// slab. Someone has to look. These are the frames they look at.
//
// Skipped unless MOBILE_SHOTS_DIR is set, so a normal `npm run test:e2e` never
// rewrites the committed PNGs. Capture with:
//
//   bash scripts/mobile-shots.sh before      # from the pre-pass code
//   bash scripts/mobile-shots.sh after
//
// Every shot is full-page: what a thumb scrolls through, not just the fold.
//
// `animations: "disabled"` since Sprint 12: it fast-forwards any running
// animation to its END state before the shutter. Without it a list entrance
// with `fill-mode: both` can be captured at opacity 0 and produce a frame of
// blank rows — a camera that lies. The suite-wide reduced-motion setting in
// playwright.config.ts already makes these near-instant; this is the belt.

import { expect, test } from "@playwright/test"

import { ACCOUNTS, signInAs } from "./fixtures/auth.ts"

const DIR = process.env.MOBILE_SHOTS_DIR

test.describe("phone-width screenshots", () => {
  test.skip(!DIR, "set MOBILE_SHOTS_DIR (see scripts/mobile-shots.sh)")

  const shot = (name: string) => `${DIR}/${name}.png`

  test("the bet menu — open, closed, and mid-confirm", async ({ page }) => {
    await signInAs(page, ACCOUNTS.approved)
    await page.goto("/bets")
    await expect(page.getByRole("heading", { name: "Bet Menu" })).toBeVisible()

    // 1. The menu as it opens: filters, an open bet card per category, and the
    //    fixed bet-slip bar pinned over the bottom of it.
    await page.screenshot({ path: shot("bets-open"), fullPage: true, animations: "disabled" })

    // 2. Mid-placement — the two-tap confirm strip staged under a stake. This
    //    is the moment the tap targets have to be real: radio, field, ↵.
    const card = page.getByTestId("bet-1")
    await card.getByRole("textbox").first().fill("5")
    await card.getByRole("button", { name: "Place stake" }).first().click()
    await expect(card.getByRole("button", { name: /Confirm bet/ })).toBeVisible()
    await page.screenshot({ path: shot("bets-confirm"), fullPage: true, animations: "disabled" })

    // 3. The closed side: per-pick totals, and the reveal expanded to the wall
    //    of names it collapses (#103).
    await page.getByRole("button", { name: "Closed" }).click()
    const reveal = page.getByRole("button", { name: /Show \d+ bettors?/ }).first()
    if (await reveal.isVisible().catch(() => false)) await reveal.click()
    await page.screenshot({ path: shot("bets-closed"), fullPage: true, animations: "disabled" })
  })

  test("the two wide tables", async ({ page }) => {
    await signInAs(page, ACCOUNTS.approved)

    // The 8-column standings grid — the one that used to be a 520px scroller.
    await page.goto("/leaderboard")
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible()
    await page.screenshot({ path: shot("leaderboard"), fullPage: true, animations: "disabled" })

    // /my-bets carries the same money rows the results table does and, unlike
    // /results, needs no completed tournament to render.
    await page.goto("/my-bets")
    await expect(page.getByRole("heading", { name: "My Bets" })).toBeVisible()
    await page.screenshot({ path: shot("my-bets"), fullPage: true, animations: "disabled" })
  })

  test("the admin console an admin runs from the course", async ({ page }) => {
    await signInAs(page, ACCOUNTS.admin)

    await page.goto("/admin/close")
    await expect(page.getByRole("heading", { name: /Close/ }).first()).toBeVisible()
    await page.screenshot({ path: shot("admin-close"), fullPage: true, animations: "disabled" })

    await page.goto("/admin/people")
    await expect(page.getByRole("heading", { name: /People/ }).first()).toBeVisible()
    await page.screenshot({ path: shot("admin-people"), fullPage: true, animations: "disabled" })
  })
})
