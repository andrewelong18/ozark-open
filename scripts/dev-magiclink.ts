// Dev helper: mint a magic-link login URL for an existing account WITHOUT
// sending any email. Handy when testing against a hosted Supabase project (no
// local Inbucket to catch mail). Prints an action link — paste it into your
// browser and you're signed in as that account.
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

import { createClient } from "@supabase/supabase-js"

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const email = process.argv[2]
  const siteUrl = process.env.SITE_URL ?? "http://localhost:3000"

  if (!url || !serviceKey) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.")
    process.exit(1)
  }
  if (!email) {
    console.error("Usage: dev-magiclink.ts <email>  (the account must already exist)")
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  })

  if (error) {
    console.error(`Couldn't generate a link for ${email}: ${error.message}`)
    console.error("(The account must already exist — seed it or log in once first.)")
    process.exit(1)
  }

  console.log(`\nMagic link for ${email} — open this in your browser to sign in:\n`)
  console.log(data.properties?.action_link)
  console.log("")
}

main()
