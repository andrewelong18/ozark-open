// Playwright config for the Sprint 19 browser journeys.
//
// Deliberately one browser, one project. ~32 people on modern phones and
// laptops don't justify a cross-browser matrix, and the sprint's job is the
// money-critical happy paths, not exhaustive coverage.
//
// The browser is the one this environment already ships: PLAYWRIGHT_BROWSERS_PATH
// points at /opt/pw-browsers, and @playwright/test is pinned to 1.56.x because
// that's the release whose Chromium revision (1194) is the build sitting there.
// Never run `playwright install` — set PLAYWRIGHT_CHROMIUM_PATH if your machine
// keeps Chromium somewhere else, or delete the file at the default path and
// Playwright falls back to its own resolution.
//
// Nothing here boots the database. `scripts/e2e-verify.sh` owns the stack and
// the seeds and then calls this; running `npx playwright test` on its own
// expects a stack already up and the env already exported (the preflight in
// e2e/fixtures/preflight.ts says so plainly rather than timing out).

import { defineConfig, devices } from "@playwright/test"
import { existsSync } from "node:fs"

const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"

// localhost, NOT 127.0.0.1 — deliberately. /auth/callback redirects to
// `new URL(request.url).origin`, and Next normalises that to localhost. Starting
// the journey on 127.0.0.1 therefore sets the session cookie on one origin and
// lands on another, which silently drops it and bounces you to /login. Every
// spec would fail with "Email link is invalid or has expired" and nothing would
// point at the origin. (docs/DEV_TESTING.md used to recommend 127.0.0.1.)
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // The journeys share one database, so they cannot race each other.
  // Serial is also plenty fast at this size.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // `next dev` compiles a route on first hit, which can take a while on a
    // cold start — budget for it rather than chasing phantom flakes.
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
  },

  projects: [
    {
      name: "chromium",
      testIgnore: /mobile-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {},
      },
    },
    // Sprint 9's mobile pass. Same Chromium, phone emulation: 412x915, touch
    // events, and — the part that matters — the mobile viewport, so the
    // `viewport-fit=cover` + `env(safe-area-inset-*)` work in app/layout.tsx is
    // actually exercised rather than resolving to 0 like it does on desktop.
    //
    // Split by FILENAME rather than run twice: the 13 desktop journeys assert
    // behaviour that doesn't change with viewport, so re-running them here would
    // double the runtime to re-prove the same things. What's phone-specific
    // lives in mobile-*.spec.ts and runs only here.
    {
      name: "mobile",
      testMatch: /mobile-.*\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        launchOptions: existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {},
      },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
})
