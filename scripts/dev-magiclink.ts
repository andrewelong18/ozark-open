// Dev helper: mint a magic-link login URL for an existing account WITHOUT
// sending any email. Handy when testing against a hosted Supabase project (no
// local Inbucket to catch mail). Prints a link — paste it into your browser
// and you're signed in as that account.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key from Dashboard → Settings → API> \
//   node --experimental-strip-types scripts/dev-magiclink.ts approved@ozark.test
//
// Optional: SITE_URL=http://localhost:3000 (default) — the post-login redirect;
// it MUST be in the project's allowed Redirect URLs (Dashboard → Authentication
// → URL Configuration). The service_role key is admin-level — keep it out of
// git and out of NEXT_PUBLIC_*.
//
// Use localhost, not 127.0.0.1: /auth/callback redirects to the origin Next
// derives from the request, which normalises to localhost. Opening the link on
// 127.0.0.1 sets the session cookie on one origin and lands you on another, so
// you arrive back at /login as though the link had expired.
//
// The link-minting itself lives in scripts/magic-link.ts, shared with the
// Playwright sign-in fixture so the two can't drift apart.

import { magicLinkConfigFromEnv, mintMagicLink } from "./magic-link.ts"

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error("Usage: dev-magiclink.ts <email>  (the account must already exist)")
    process.exit(1)
  }

  let link: string
  try {
    link = await mintMagicLink(email, magicLinkConfigFromEnv())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  console.log(`\nMagic link for ${email} — open this in your browser to sign in:\n`)
  console.log(link)
  console.log("")
}

main()
