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

// ---------------------------------------------------------------------------
// The disclosure animation, and the guard it has to keep.
//
// An earlier pass animated these with a permanently-mounted grid collapse and
// had to revert the lot: content at `0fr` is clipped but not absent, so bettor
// names stayed findable while collapsed and admin form controls resolved twice.
// <Collapse> mounts on open and unmounts after the close transition, so the
// steady closed state is genuinely empty.
//
// This test is the pair of claims that combination has to satisfy at once:
// the panel ANIMATES, and closed still means gone.
// ---------------------------------------------------------------------------
test.describe("collapse", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } })

  test("a closed-bet reveal grows open, and leaves nothing behind when shut", async ({
    page,
  }) => {
    await signInAs(page, ACCOUNTS.approved)
    await page.goto("/bets")
    await page.getByRole("button", { name: "Closed", exact: true }).click()

    // Seeded: nonplayer@ has one wager on closed bet 5.
    const card = page.getByTestId("bet-5")
    const name = card.getByText("Nina Nonplayer")
    const toggle = card.getByRole("button", { name: /(Show|Hide) 1 bettor\b/ })

    // Never opened: absent, not merely hidden. This is the #103 guard.
    await expect(name).toHaveCount(0)

    const before = (await card.boundingBox())!.height
    await toggle.click()

    // Sampled mid-flight. A snap would already be at its final height here.
    await page.waitForTimeout(70)
    const mid = (await card.boundingBox())!.height
    await expect(name).toBeVisible()
    await page.waitForTimeout(400)
    const after = (await card.boundingBox())!.height

    expect(mid).toBeGreaterThan(before)
    expect(mid).toBeLessThan(after)

    // Closed again → back out of the DOM once the transition finishes.
    await toggle.click()
    await expect(name).toHaveCount(0, { timeout: 5_000 })
  })
})

// ---------------------------------------------------------------------------
// The two ongoing animations. Both are exceptions to the brand's "no infinite
// loops" rule, granted because they carry information that is only true while
// they run — so the test that matters is that they STOP when it stops being
// true, not merely that they start.
// ---------------------------------------------------------------------------
test.describe("live indicators", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } })

  test("only Open badges pulse, and the countdown border actually rotates", async ({
    page,
  }) => {
    await signInAs(page, ACCOUNTS.approved)
    await page.goto("/bets")

    // The menu header badge reflects the menu's own status. Whichever it is,
    // the ring must exist for exactly the open case and never otherwise.
    const openBadges = page.locator("span").filter({ hasText: /^Open$/ })
    const closedBadges = page.locator("span").filter({ hasText: /^Closed$/ })
    const ringsInOpen = await openBadges.locator("[class*='live-ping']").count()
    const ringsInClosed = await closedBadges.locator("[class*='live-ping']").count()
    expect(ringsInClosed).toBe(0)
    if ((await openBadges.count()) > 0) expect(ringsInOpen).toBeGreaterThan(0)

    // The countdown's conic border is driven by an @property-registered
    // --angle. Unregistered it would be a string to the interpolator and the
    // gradient would jump between keyframes instead of rotating, so sampling
    // the angle twice is the assertion that it is genuinely animating.
    await page.goto("/dashboard")
    const sweep = page.locator("[class*='live-sweep']").first()
    if ((await sweep.count()) === 0) test.skip(true, "countdown not on this dashboard")

    // Assert the animation is RUNNING rather than sampling --angle twice and
    // hoping the two reads differ: a 6s cycle can return the same value at two
    // arbitrary moments, which is exactly how the first version of this test
    // failed. getAnimations() is the direct question.
    const running = await sweep.evaluate((el) =>
      el.getAnimations().map((a) => (a as CSSAnimation).animationName ?? "")
    )
    expect(running).toContain("live-sweep")

    // …and that the ::after ACTUALLY SEES the sweep. This is the assertion that
    // matters, and the one this test used to get wrong: it sampled --angle on
    // the ELEMENT, which is where the animation runs and which was therefore
    // never the broken half. The gradient is painted by the `live-border`
    // ::after, and a pseudo-element does not inherit a NON-inheriting registered
    // property from its originating element — so with the old
    // `@property --angle { inherits: false }` the element swept 0→360deg while
    // ::after sat at a flat 0deg and the border never moved. Registered,
    // running, and invisible. Only the pseudo-element can tell us apart.
    //
    // Sampling the PAINTED gradient rather than just the custom property,
    // because `background-image` is the thing the user's eye is actually
    // reading — it resolves to `conic-gradient(from <angle>, …)`.
    const paint = () =>
      sweep.evaluate((el) =>
        getComputedStyle(el, "::after").backgroundImage
      )
    const readAngle = (bg: string) => {
      const m = bg.match(/from\s+(-?[\d.]+)deg/)
      return m ? Number(m[1]) : null
    }

    const first = readAngle(await paint())
    expect(first, "::after must paint a conic-gradient driven by --angle").not.toBeNull()

    // 6s for 360deg is 60deg/s, so a 1s gap moves it ~60deg. Poll instead of
    // sampling once: under load a single pair could land a full cycle apart,
    // and any movement at all is what is being claimed.
    let moved = false
    for (let i = 0; i < 12 && !moved; i++) {
      await page.waitForTimeout(150)
      moved = readAngle(await paint()) !== first
    }
    expect(moved, "the countdown's conic border must actually rotate").toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The row stagger. Same failure shape as the countdown sweep, and it shipped
// broken for the same reason: an animation that runs, and a value that never
// reaches the element that needed it.
//
// `--animate-rise-in` is declared by @theme on :root, so a `var(--stagger-delay)`
// written INSIDE that shorthand is substituted at :root — where the `stagger`
// utility never sets it — and every row inherited the already-resolved 0ms
// fallback. Every row animated, so the page looked animated; they just all
// arrived at once, which is the one thing a stagger is for.
//
// Asserting distinct delays is what catches that. A test that only asked
// "is rise-in running?" passed throughout.
// ---------------------------------------------------------------------------
test.describe("row stagger", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } })

  test("staggered rows get distinct, capped animation delays", async ({ page }) => {
    await signInAs(page, ACCOUNTS.approved)
    await page.goto("/leaderboard")

    const rows = page.locator("[class*='stagger']")
    const count = await rows.count()
    if (count < 3) test.skip(true, "not enough seeded rows to show a cascade")

    const delays = await rows.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).animationDelay)
    )
    console.log(`stagger delays: ${delays.slice(0, 8).join(", ")}`)

    // The cascade exists at all — the whole bug was every row reading 0s.
    expect(new Set(delays).size).toBeGreaterThan(1)
    expect(delays[0]).toBe("0s")
    expect(delays[1]).toBe("0.04s")

    // And it is capped, so a long table still finishes inside the budget.
    const ms = delays.map((d) => Number(d.replace("s", "")) * 1000)
    expect(Math.max(...ms)).toBeLessThanOrEqual(240)
  })
})
