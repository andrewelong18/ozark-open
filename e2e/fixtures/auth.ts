// Signing a spec in as a seeded account, without email.
//
// The seam is scripts/magic-link.ts — the same admin.generateLink → token_hash
// path the dev CLI uses, landing on the same /auth/callback the production email
// template links to. Nothing in the app knows it is being tested: there is no
// test-only login route, no password backdoor, no relaxed guard. If magic-link
// sign-in breaks in production, these specs break too, which is the point.

import { execFileSync } from "node:child_process"

import { expect, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { magicLinkConfigFromEnv, mintMagicLink } from "../../scripts/magic-link.ts"

/** The five seeded dummy accounts (supabase/seed-dev-accounts.sql). */
export const ACCOUNTS = {
  admin: "admin@ozark.test",
  approved: "approved@ozark.test",
  nonplayer: "nonplayer@ozark.test",
  pending: "pending@ozark.test",
  newbie: "newbie@ozark.test",
} as const

function serviceClient() {
  const { supabaseUrl, serviceRoleKey } = magicLinkConfigFromEnv()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Sign `page` in as a seeded account and wait until the app agrees.
 *
 * Where you land is the app's business, not ours: an onboarded account lands on
 * /dashboard, an un-onboarded one is bounced to /onboarding by the middleware.
 * We only assert that we are no longer on /login — asserting a destination here
 * would quietly duplicate (and then contradict) the onboarding journey.
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  const link = await mintMagicLink(email, magicLinkConfigFromEnv())
  await page.goto(link)
  await expect(page).not.toHaveURL(/\/login/)
}

export async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies()
}

/** The `users.id` behind a seeded email — needed for /bets?for=<userId>. */
export async function userIdFor(email: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from("users")
    .select("id")
    .eq("email", email)
    .single()

  if (error || !data) throw new Error(`No account for ${email}: ${error?.message ?? "not found"}`)
  return data.id as string
}

/**
 * Read a member's live wagers straight from the database, bypassing RLS.
 *
 * Used only to set up or tear down, never to assert a journey's outcome —
 * what the member sees on screen is the thing under test (a spec that checked
 * the database instead of the DOM is how #105 shipped as a no-op).
 */
export async function deletePlacementsFor(email: string): Promise<void> {
  const supabase = serviceClient()
  const userId = await userIdFor(email)
  const { error } = await supabase.from("bet_placements").delete().eq("user_id", userId)
  if (error) throw new Error(`Couldn't clear wagers for ${email}: ${error.message}`)
}

/**
 * Re-apply supabase/seed-e2e.sql — the fixture's single source of truth.
 *
 * For the journeys that drive the menu through its real lifecycle: closing a
 * bet and publishing results are one-way doors in the app, so those specs put
 * the fixture back rather than leaving whoever runs next to inherit a settled
 * tournament.
 */
export function reloadFixture(): void {
  const dbUrl = process.env.E2E_DB_URL
  if (!dbUrl) {
    throw new Error("E2E_DB_URL isn't set — run the suite through scripts/e2e-verify.sh.")
  }
  execFileSync("psql", [dbUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "supabase/seed-e2e.sql"], {
    encoding: "utf-8",
  })
}

/** Put an account back to un-onboarded so the onboarding journey can re-run. */
export async function resetOnboarding(email: string): Promise<void> {
  const supabase = serviceClient()
  const userId = await userIdFor(email)

  // avatar_url is cleared too, or the avatar spec (#90) would pass on the
  // photo a previous run left behind instead of the one it just uploaded.
  const { error } = await supabase
    .from("users")
    .update({
      onboarded_at: null,
      display_name: email,
      nickname: null,
      avatar_url: null,
    })
    .eq("id", userId)
  if (error) throw new Error(`Couldn't reset onboarding for ${email}: ${error.message}`)

  await supabase.from("tournament_participants").delete().eq("user_id", userId)
}
