// The avatar upload, through real Storage RLS (#90).
//
// WHY THIS SPEC EXISTS. #90 was a P0: attaching a photo during onboarding
// failed with "new row violates row-level security policy", and onboarding is
// the highest-support-load moment of September — ~32 people hit it on one
// evening. It was diagnosed twice and never covered by a test, because
// e2e/onboarding.spec.ts deliberately skips the file input and lib/avatar.ts's
// unit tests hand in a fake client that never speaks to Storage.
//
// So nothing in the suite ever proved that a signed-in member can actually
// write to the avatars bucket. That is the gap this closes: the local stack
// applies 20260719000001_avatars_bucket.sql like any other migration, so the
// four policies here are the same four that run in production, evaluated
// against a real JWT from a real sign-in.
//
// WHAT IT DOES AND DOESN'T PROVE. It proves the upload path works end to end
// against genuine RLS. It does NOT prove the historical failure is impossible:
// the shipped explanation was a race against cookie hydration, and a race
// doesn't reproduce on demand in a headless browser. Read this as "the door
// opens", not "the door can never stick".

import { expect, test } from "@playwright/test"

import { ACCOUNTS, resetOnboarding, signInAs } from "./fixtures/auth.ts"

// Repo-relative: Playwright runs from the repo root, and import.meta.url does
// not survive this project's transform.
const FIXTURE = "e2e/fixtures/avatar.png"

test("a new member can attach a photo during onboarding", async ({ page }) => {
  await resetOnboarding(ACCOUNTS.newbie)
  await signInAs(page, ACCOUNTS.newbie)

  await page.goto("/onboarding")
  await expect(page.getByText("Set up your profile")).toBeVisible()

  await page.locator("#avatar-file").setInputFiles(FIXTURE)
  await page.locator("#display-name").fill("Nate Newbie")
  await page.getByRole("button", { name: "Continue" }).click()

  // The assertion with teeth. On the bug, submitting surfaced
  // "Uploading your photo failed: new row violates row-level security policy"
  // and the form stayed put — so reaching the walkthrough at all means the
  // Storage write was accepted. Asserting the absence of the message too, so
  // a future silent-failure refactor can't turn a red test green.
  await expect(page.getByText(/row-level security/i)).toHaveCount(0)
  await expect(page.getByText("How the Sportsbook Works")).toBeVisible()

  // The walkthrough gates the finish button behind its four cards.
  for (const step of [2, 3, 4]) {
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await expect(page.getByText(`${step} of 4`)).toBeVisible()
  }
  await page.getByRole("button", { name: "Start betting" }).click()
  await expect(page).toHaveURL(/\/bets/)

  // #90's "Done when": the photo is visible afterwards. The header avatar
  // reads users.avatar_url, which /api/onboarding only writes once the upload
  // has landed — so a real <img> here means the object is in the bucket and
  // publicly readable, not merely that the POST returned 200.
  await page.goto("/dashboard")
  // resetOnboarding() nulls avatar_url, so a rendered <img> can only have come
  // from this run's upload — the placeholder is a <span> of initials.
  const avatar = page.locator("header img").first()
  await expect(avatar).toBeVisible()
  await expect(avatar).toHaveAttribute("src", /\/storage\/v1\/object\/public\/avatars\//)
})

test("and can replace it from /profile", async ({ page }) => {
  // The second half of #90's "Done when", and a genuinely different code path
  // at the database: the object already exists by now, so `upsert: true` takes
  // the UPDATE policy rather than INSERT. Hypothesis 1 on the issue was that
  // this path failed on the existing row's owner — worth a test either way,
  // since nothing else in the suite exercises an avatar overwrite.
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/profile")

  await page.getByRole("button", { name: "Personalize" }).click()
  await page.locator("#avatar-file").setInputFiles(FIXTURE)
  await page.getByRole("button", { name: "Save profile" }).click()

  await expect(page.getByText(/row-level security/i)).toHaveCount(0)
  await expect(page.getByText("Saved ✓")).toBeVisible()
})
