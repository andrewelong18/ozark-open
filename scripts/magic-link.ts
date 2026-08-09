// Minting a magic-link login URL without sending email — the one implementation.
//
// Two callers share it so they can't drift apart:
//   * scripts/dev-magiclink.ts — the human CLI (prints a link to paste)
//   * e2e/fixtures/auth.ts     — the Playwright sign-in fixture
//
// Why token_hash and not properties.action_link (Sprint 21 / #94): action_link is
// the legacy /auth/v1/verify?token=… URL, which hands the session back as a URL
// *hash fragment*. A hash never reaches the server, so /auth/callback — a server
// route — correctly answers "Login link was missing its token." The token_hash
// shape below is what app/auth/callback/route.ts verifies via verifyOtp, and it's
// also what the production email template sends.
//
// This is a real login through the real callback. There is deliberately no
// test-only auth bypass in the app: the service_role key is the seam, and it
// never leaves the local stack.

import { createClient } from "@supabase/supabase-js"

export type MagicLinkConfig = {
  supabaseUrl: string
  serviceRoleKey: string
  /** Where the callback runs. The host in the returned link. */
  siteUrl: string
}

/**
 * Read the config from the environment, with the same variable names and
 * fallbacks the dev CLI has always used. Throws with an actionable message
 * rather than returning a half-built config.
 */
export function magicLinkConfigFromEnv(): MagicLinkConfig {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.")
  }
  return { supabaseUrl, serviceRoleKey, siteUrl }
}

/**
 * Mint a `/auth/callback?token_hash=…&type=magiclink` URL for an existing
 * account. The account must already exist — seeded, or logged in once.
 */
export async function mintMagicLink(email: string, config: MagicLinkConfig): Promise<string> {
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const siteUrl = config.siteUrl.replace(/\/+$/, "")
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  })

  if (error) {
    throw new Error(
      `Couldn't generate a link for ${email}: ${error.message}\n` +
        "(The account must already exist — seed it or log in once first.)"
    )
  }

  const tokenHash = data.properties?.hashed_token
  if (!tokenHash) {
    throw new Error(`Supabase returned no hashed_token for ${email} — can't build a callback link.`)
  }

  return `${siteUrl}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`
}
