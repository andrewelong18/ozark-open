import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

// Magic-link callback. Supabase can hand us the session in more than one shape,
// so we handle all of them and always surface the *real* failure reason instead
// of a blanket "auth_failed":
//
//   1. token_hash + type  → verifyOtp()          (stateless; survives opening
//                                                  the link on another device /
//                                                  in an email in-app browser)
//   2. code               → exchangeCodeForSession()  (PKCE; requires the
//                                                  code-verifier cookie from the
//                                                  browser that requested it)
//   3. error / error_code → Supabase already rejected the link (expired, reused
//                           by a mail scanner, etc.) — pass the reason through.
//
// The production email template uses shape (1); shape (2) is kept so links from
// the older PKCE template (and any in-flight emails) still work.

const VALID_OTP_TYPES: EmailOtpType[] = [
  "email",
  "magiclink",
  "signup",
  "recovery",
  "invite",
  "email_change",
]

// Only ever redirect to a same-origin relative path — never an attacker-supplied
// absolute URL smuggled in via ?next=.
function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next
  return "/dashboard"
}

function fail(origin: string, message: string) {
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(message)}`
  )
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  // Shape 3: Supabase rejected the link before it ever reached us.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error")
  if (providerError) {
    return fail(origin, providerError)
  }

  const next = safeNext(searchParams.get("next"))
  const supabase = await createClient()

  // Shape 1: stateless token_hash verification (the production template).
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  if (tokenHash && type) {
    if (!VALID_OTP_TYPES.includes(type as EmailOtpType)) {
      return fail(origin, `Unsupported link type: ${type}`)
    }
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    return fail(origin, error.message)
  }

  // Shape 2: PKCE code exchange.
  const code = searchParams.get("code")
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    return fail(origin, error.message)
  }

  return fail(origin, "Login link was missing its token. Request a new one.")
}
