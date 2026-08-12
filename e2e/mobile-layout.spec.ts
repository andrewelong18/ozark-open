// The mobile pass, asserted mechanically.
//
// Sprint 19's lesson was that a spec which only checks a page loaded is worth
// nothing: #105 shipped as a no-op past eleven green unit tests because none of
// them read the screen. The mobile equivalent of that mistake is a phone
// project that navigates to every route and asserts an <h1> — every layout
// defect in this file's history would have sailed through it.
//
// So these assert geometry, at 412x915 with touch:
//
//   1. No route overflows the viewport horizontally. A page you can drag
//      sideways is the symptom of a fixed-width table, an unwrappable heading
//      or a min-w- floor, and it hides content off the right edge.
//   2. Every control on /bets is reachable by a thumb — measured by probing
//      where taps actually land, not by reading the border box, because a
//      control's real hit area can come from padding, a negative margin or a
//      pseudo-element that getBoundingClientRect cannot see.
//   3. The fixed footer doesn't cover the thing under it.
//
// What this still can't tell you: how any of it LOOKS. That's docs/mobile/,
// and a person.

import { expect, test, type Locator, type Page } from "@playwright/test"

import { ACCOUNTS, signInAs, signOut } from "./fixtures/auth.ts"

/** Apple's HIG minimum, and the number the whole pass was tuned against. */
const MIN_TAP = 44

/**
 * The size of a control as a THUMB experiences it.
 *
 * Walks outward from the centre in each of the four directions and records the
 * last point that still hit the control, so an expanded `::before` hit area
 * counts and an overlay sitting on top does not. `getBoundingClientRect` gets
 * both of those wrong, in opposite directions.
 *
 * Returns zeroes when the centre itself doesn't hit — the control is covered.
 */
async function tapReach(locator: Locator): Promise<{ w: number; h: number }> {
  await locator.evaluate((el) => el.scrollIntoView({ block: "center" }))
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const cx = Math.round(r.left + r.width / 2)
    const cy = Math.round(r.top + r.height / 2)
    const hits = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
        return false
      }
      const at = document.elementFromPoint(x, y)
      // The control itself, or something inside it. Deliberately NOT an
      // ancestor: a point that misses the button and lands on its row would
      // otherwise count as a hit and inflate every measurement.
      return !!at && (at === el || el.contains(at))
    }
    if (!hits(cx, cy)) return { w: 0, h: 0 }
    const reach = (dx: number, dy: number) => {
      let d = 1
      while (d <= 40 && hits(cx + dx * d, cy + dy * d)) d++
      return d - 1
    }
    return {
      w: reach(1, 0) + reach(-1, 0) + 1,
      h: reach(0, 1) + reach(0, -1) + 1,
    }
  })
}

async function expectTappable(locator: Locator, what: string) {
  const { w, h } = await tapReach(locator)
  expect(h, `${what}: ${w}x${h}, needs ${MIN_TAP} tall`).toBeGreaterThanOrEqual(MIN_TAP)
  expect(w, `${what}: ${w}x${h}, needs ${MIN_TAP} wide`).toBeGreaterThanOrEqual(MIN_TAP)
}

/** Does the document scroll sideways? 1px of slack for sub-pixel rounding. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement
    return Math.max(
      doc.scrollWidth - doc.clientWidth,
      document.body.scrollWidth - doc.clientWidth
    )
  })
}

// Every route the app serves, with the account that can see it. `/onboarding`
// is the odd one: it is only reachable by an account that hasn't finished it,
// and the middleware sends that account there from anywhere.
const ROUTES: { path: string; as: string | null; heading?: RegExp }[] = [
  { path: "/login", as: null },
  { path: "/", as: ACCOUNTS.approved },
  { path: "/dashboard", as: ACCOUNTS.approved },
  { path: "/bets", as: ACCOUNTS.approved, heading: /Bet Menu/ },
  { path: "/my-bets", as: ACCOUNTS.approved, heading: /My Bets/ },
  { path: "/leaderboard", as: ACCOUNTS.approved, heading: /Leaderboard/ },
  { path: "/results", as: ACCOUNTS.approved },
  { path: "/profile", as: ACCOUNTS.approved },
  { path: "/onboarding", as: ACCOUNTS.newbie },
  { path: "/admin/people", as: ACCOUNTS.admin },
  { path: "/admin/import", as: ACCOUNTS.admin },
  { path: "/admin/view", as: ACCOUNTS.admin },
  { path: "/admin/close", as: ACCOUNTS.admin },
  { path: "/admin/rules", as: ACCOUNTS.admin },
  { path: "/style-guide", as: ACCOUNTS.admin },
]

test.describe("nothing overflows a phone", () => {
  for (const route of ROUTES) {
    test(`${route.path} fits the viewport`, async ({ page }) => {
      await signOut(page)
      if (route.as) await signInAs(page, route.as)
      await page.goto(route.path)
      if (route.heading) {
        await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible()
      }
      // Let fonts and the nav's scroll-into-view settle before measuring.
      await page.waitForLoadState("networkidle").catch(() => {})

      expect(
        await horizontalOverflow(page),
        `${route.path} scrolls sideways — something is wider than 412px`
      ).toBeLessThanOrEqual(1)
    })
  }
})

test.describe("the bet menu under a thumb", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, ACCOUNTS.approved)
    await page.goto("/bets")
    await expect(page.getByRole("heading", { name: "Bet Menu" })).toBeVisible()
  })

  // The blanket sweep. Scoped to <main> on purpose: Next's dev-overlay button
  // lives outside it, and inline text links inside table rows are a different
  // kind of target that a 44px rule would only make worse.
  test("every control in the menu is at least 44px", async ({ page }) => {
    const controls = page.locator("main button:visible, main input:visible")
    const n = await controls.count()
    expect(n, "the menu should have controls to check").toBeGreaterThan(20)

    const undersized: string[] = []
    for (let i = 0; i < n; i++) {
      const control = controls.nth(i)
      const { w, h } = await tapReach(control)
      if (w < MIN_TAP || h < MIN_TAP) {
        const label =
          (await control.getAttribute("aria-label")) ??
          (await control.innerText().catch(() => "")) ??
          ""
        undersized.push(`${label.trim().slice(0, 40) || "(unlabelled)"} → ${w}x${h}`)
      }
    }
    expect(undersized, "controls smaller than 44px, or covered by something").toEqual([])
  })

  // Named, so a regression on one of them fails with the defect's own name
  // rather than as an anonymous entry in the sweep's list.
  test("the controls the pass was about, by name", async ({ page }) => {
    const card = page.getByTestId("bet-1")

    await expectTappable(card.getByRole("textbox").first(), "stake field")
    await expectTappable(
      card.getByRole("button", { name: "Place stake" }).first(),
      "place-stake ↵"
    )

    // The pick-one bet's stake field. It replaced the radio as the way to
    // choose (#162), so on a Match bet a miss here is a bet that never
    // happened — same stake as the radio's 44px used to carry.
    const pickOne = page
      .locator('[data-testid^="bet-"]')
      .filter({ hasText: "Pick one" })
      .first()
    await expectTappable(
      pickOne.getByRole("textbox").first(),
      "pick-one stake field (the selector, since #162)"
    )

    await expectTappable(
      page.getByRole("button", { name: "Closed", exact: true }),
      "open/closed toggle"
    )
    await expectTappable(
      page.getByRole("button", { name: "All Categories" }),
      "filter chip"
    )
    await expectTappable(
      page.getByRole("link", { name: /Review all/ }),
      "bet slip → Review all"
    )
  })

  test("the reveal toggle on a closed bet", async ({ page }) => {
    await page.getByRole("button", { name: "Closed", exact: true }).click()
    await expectTappable(
      page.getByRole("button", { name: /Show \d+ bettors?/ }).first(),
      "reveal toggle"
    )
  })

  // The bar is fixed over the bottom of the page. Its whole job is to be
  // visible; its whole risk is covering the control under it — which is how
  // "type a stake and tap ↵" becomes "type a stake and tap the bar".
  test("the fixed slip bar never covers the last stake field", async ({ page }) => {
    const fields = page.getByRole("textbox")
    const last = fields.last()
    await last.scrollIntoViewIfNeeded()
    await page.mouse.wheel(0, 2000) // all the way to the bottom
    await page.waitForTimeout(300)

    const { h } = await tapReach(last)
    expect(h, "the last stake field is covered at the bottom of the page").toBeGreaterThanOrEqual(
      MIN_TAP
    )
  })

  // The error toast used to be pinned at a hardcoded bottom-[4.75rem] — a guess
  // at the bar's height. Stacked in the bar's own flow now, so it sits above it
  // whatever height the bar is.
  test("an error toast stacks above the slip bar, not on top of it", async ({ page }) => {
    const card = page.getByTestId("bet-1")
    // $0 is rejected by lib/validation (#92) and surfaces as the toast.
    await card.getByRole("textbox").first().fill("0")
    await card.getByRole("button", { name: "Place stake" }).first().click()

    // Scoped to <main>: Next ships its own role="alert" route announcer on
    // <body>, so a bare getByRole("alert") is ambiguous.
    const toast = page.locator('main [role="alert"]')
    await expect(toast).toBeVisible()

    const toastBox = await toast.boundingBox()
    const barBox = await page
      .getByRole("link", { name: /Review all/ })
      .boundingBox()
    expect(toastBox).not.toBeNull()
    expect(barBox).not.toBeNull()

    // Above, and not overlapping: the toast's bottom edge is over the bar's top.
    expect(
      toastBox!.y + toastBox!.height,
      "the toast overlaps the tally bar"
    ).toBeLessThanOrEqual(barBox!.y + 1)

    // And the whole stack clears the bottom of the screen.
    expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(915)
  })
})

test.describe("the pill rails scroll to what's selected", () => {
  // The rail overflows 412px — "Leaderboard", the fourth pill, is the one the
  // fade cuts off. Landing there used to show a rail with nothing highlighted
  // and no reason to think it scrolled at all.
  test("the active nav pill is brought into view", async ({ page }) => {
    await signInAs(page, ACCOUNTS.approved)
    await page.goto("/leaderboard")

    const active = page.locator('nav a[aria-current="page"]')
    await expect(active).toHaveCount(1)

    const box = await active.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x, "the active pill starts off the left edge").toBeGreaterThanOrEqual(-1)
    expect(
      box!.x + box!.width,
      "the active pill runs off the right edge — the rail didn't scroll to it"
    ).toBeLessThanOrEqual(413)
  })

  test("nav pills are 44px", async ({ page }) => {
    await signInAs(page, ACCOUNTS.approved)
    await page.goto("/dashboard")
    await expectTappable(page.getByRole("link", { name: "Bet Menu" }), "nav pill")
  })
})
