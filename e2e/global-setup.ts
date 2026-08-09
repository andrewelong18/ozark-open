// Fail in a second with a sentence you can act on, instead of thirty timeouts.
//
// Three failure modes are worth catching before a single browser starts, because
// each one produces baffling symptoms downstream:
//
//   * No Supabase env — middleware.ts logs and calls NextResponse.next(), i.e.
//     every guarded route renders UNAUTHENTICATED. Specs then fail on missing
//     content rather than on the missing login, and you chase the wrong bug.
//   * Stack unreachable — every page 500s.
//   * Fixtures not loaded — the menu is empty and every journey fails on an
//     EmptyState that looks like a rendering bug.

import { createClient } from "@supabase/supabase-js"

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const

const HOW = "Run `bash scripts/e2e-verify.sh` — it starts the stack, loads the fixtures and exports these."

export default async function globalSetup(): Promise<void> {
  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`E2E preflight: missing ${missing.join(", ")}.\n${HOW}`)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(
      `E2E preflight: NEXT_PUBLIC_SUPABASE_URL is ${url}, which is not the local stack.\n` +
        "These specs create accounts and place wagers — they must never point at a hosted project."
    )
  }

  const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { count: openBets, error: betsError } = await supabase
    .from("bets")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
  if (betsError) {
    throw new Error(`E2E preflight: can't reach the stack at ${url} — ${betsError.message}\n${HOW}`)
  }
  if (!openBets) {
    throw new Error(`E2E preflight: no open bets — the fixtures aren't loaded.\n${HOW}`)
  }

  const { data: accounts, error: usersError } = await supabase
    .from("users")
    .select("email")
    .like("email", "%@ozark.test")
  if (usersError || (accounts?.length ?? 0) < 5) {
    throw new Error(
      `E2E preflight: expected the five @ozark.test accounts, found ${accounts?.length ?? 0}.\n${HOW}`
    )
  }
}
