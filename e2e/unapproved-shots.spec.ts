// Screenshots of the three member surfaces as they look to someone who has
// signed in and onboarded but has NOT been approved to bet yet — i.e. an
// authenticated user with no live `tournament_participants` row.
//
// Not an assertion — a camera, the same deal as e2e/mobile-shots.spec.ts. The
// approval-pending state is three different copy blocks in three different
// files (app/dashboard/page.tsx's EmptyState, app/bets/page.tsx's grey note
// above the menu, app/my-bets/page.tsx's EmptyState), and the only way to know
// they read as one coherent "you're in the queue" message is to look at them
// side by side.
//
// The persona is pending@ozark.test (Parker Pending) from
// supabase/seed-dev-accounts.sql: onboarded_at set, so the middleware gate lets
// them past /onboarding, and supabase/seed-e2e.sql deletes their participant
// row, so every `isParticipant` check on every page resolves false.
//
// Skipped unless UNAPPROVED_SHOTS_DIR is set, so a normal `npm run test:e2e`
// never writes PNGs. Capture with:
//
//   bash scripts/unapproved-shots.sh
//
// Both widths, because the pending state is mostly empty states and those are
// exactly what a narrow viewport reflows worst. `animations: "disabled"`
// fast-forwards any entrance to its end state before the shutter, so a
// `fill-mode: both` rise-in can't be photographed at opacity 0.

import { expect, test } from "@playwright/test"

import { ACCOUNTS, signInAs } from "./fixtures/auth.ts"

const DIR = process.env.UNAPPROVED_SHOTS_DIR

// Desktop first (the config's Desktop Chrome default is 1280x720; taller here
// so the dashboard's right rail lands in frame), then a Pixel-7-sized viewport.
// Viewport is set per-shot rather than by adding a `mobile` project, because
// playwright.config.ts splits projects by FILENAME and this file is one story
// told at two widths, not two suites.
const WIDTHS = [
  { name: "desktop", viewport: { width: 1280, height: 900 } },
  { name: "mobile", viewport: { width: 412, height: 915 } },
] as const

test.describe("approval-pending screenshots", () => {
  test.skip(!DIR, "set UNAPPROVED_SHOTS_DIR (see scripts/unapproved-shots.sh)")

  for (const { name, viewport } of WIDTHS) {
    test(`the three member pages, ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await signInAs(page, ACCOUNTS.pending)

      const shot = async (slug: string) => {
        // `next dev` mounts its dev-tools badge in a <nextjs-portal> fixed to
        // the viewport, which lands on top of the page in every frame. It does
        // not exist in the production build, so hiding it makes the shot MORE
        // faithful, not less. Re-applied per shot because each navigation
        // discards the injected tag.
        await page.addStyleTag({
          content: "nextjs-portal { display: none !important; }",
        })
        await page.screenshot({
          path: `${DIR}/${slug}-${name}.png`,
          fullPage: true,
          animations: "disabled",
        })
      }

      // 1. /dashboard — pool + player count still render (they're everyone's
      //    numbers), "Your Entry" reads $0 / "Pending approval", and the whole
      //    Place Bets → rules-card block is replaced by the pending card.
      await page.goto("/dashboard")
      // getByText, not getByRole("heading") — EmptyState renders its title as a
      // styled div, so there is no heading role to wait on.
      await expect(page.getByText("Approval pending")).toBeVisible()
      await expect(page.getByText("Pending approval")).toBeVisible()
      await shot("dashboard")

      // 2. /bets — the full menu IS browsable; what's missing is every stake
      //    input and the fixed bet-slip bar, replaced by one grey note.
      await page.goto("/bets")
      await expect(page.getByRole("heading", { name: "Bet Menu" })).toBeVisible()
      await expect(page.getByText(/an admin just needs to approve you/)).toBeVisible()
      await shot("bets")

      // 3. /my-bets — the page never gets past its participant read, so there
      //    is no budget bar and no rules card, just the pending card.
      await page.goto("/my-bets")
      await expect(page.getByText("Approval pending")).toBeVisible()
      await shot("my-bets")
    })
  }
})
