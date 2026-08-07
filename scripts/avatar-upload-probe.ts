// Diagnostic for #90: "new row violates row-level security policy" when a
// member uploads an avatar during onboarding. NOT a fix — this captures the
// failing request, which is what the issue asks for before anyone rewrites a
// storage policy. The obvious causes are already ruled out by reading:
// the INSERT and UPDATE policies both exist (20260719000001_avatars_bucket.sql
// — `upsert: true` needs both), the path `<uid>/avatar` matches
// (storage.foldername(name))[1] = auth.uid()::text, and the client is a stock
// createBrowserClient.
//
// The top untested hypothesis is that the request reaches Storage as the `anon`
// role rather than `authenticated` — which produces this exact generic message,
// because the policies are `TO authenticated`. So the probe decodes the JWT it
// actually sends and prints the role and sub alongside the raw HTTP response.
//
// Usage — a real login, no service-role key needed:
//
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key> \
//   ACCESS_TOKEN=<the sb-…-auth-token access_token from your browser> \
//   node --experimental-strip-types scripts/avatar-upload-probe.ts
//
// Get ACCESS_TOKEN from DevTools → Application → Cookies on the deployed site:
// the `sb-<ref>-auth-token` value is JSON (possibly split across `.0`/`.1`
// chunks — concatenate them, and strip a leading `base64-` prefix and decode if
// present); `access_token` is the field you want. That is the credential the
// browser client uses, so a probe with it reproduces the browser's request
// exactly.
//
// Alternatively, mint one without touching a browser:
//   SUPABASE_SERVICE_ROLE_KEY=<service key> ... plus EMAIL=<member@example.com>
// and the probe will generate + verify a magic link for that account itself.

import { createClient } from "@supabase/supabase-js"

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.EMAIL

function decodeJwt(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1]
  if (!payload) return null
  try {
    return JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
  } catch {
    return null
  }
}

/** Mint an access token for EMAIL the way a real login would (needs service key). */
async function accessTokenFromMagicLink(): Promise<string> {
  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: email!,
  })
  if (error) throw new Error(`generateLink failed: ${error.message}`)
  const tokenHash = data.properties?.hashed_token
  if (!tokenHash) throw new Error("generateLink returned no hashed_token")

  const asUser = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const verified = await asUser.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash })
  if (verified.error) throw new Error(`verifyOtp failed: ${verified.error.message}`)
  const token = verified.data.session?.access_token
  if (!token) throw new Error("verifyOtp returned no session")
  return token
}

async function main() {
  if (!url || !anonKey) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (the same values the app uses)."
    )
    process.exit(1)
  }

  let token = process.env.ACCESS_TOKEN
  if (!token) {
    if (!serviceKey || !email) {
      console.error(
        "Set ACCESS_TOKEN, or set SUPABASE_SERVICE_ROLE_KEY + EMAIL and the probe will mint one."
      )
      process.exit(1)
    }
    token = await accessTokenFromMagicLink()
    console.log(`Minted an access token for ${email} via magic link.\n`)
  }

  const claims = decodeJwt(token)
  const sub = claims?.sub as string | undefined
  console.log("── The credential the request will carry ──────────────────────")
  console.log(`  role : ${claims?.role ?? "(none — this alone would explain the RLS denial)"}`)
  console.log(`  sub  : ${sub ?? "(none)"}`)
  const exp = typeof claims?.exp === "number" ? claims.exp : null
  console.log(
    `  exp  : ${exp ? new Date(exp * 1000).toISOString() : "(none)"}` +
      (exp && exp * 1000 < Date.now() ? "  ← EXPIRED, that's your answer" : "")
  )
  if (!sub) {
    console.error("\nNo `sub` claim — nothing to build the upload path from.")
    process.exit(1)
  }

  // The exact call the app makes: components/onboarding/onboarding-form.tsx
  // and components/profile/profile-form.tsx, path `${userId}/avatar`.
  const path = `${sub}/avatar`
  const body = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  ) // a 1x1 gif — small enough to be about policy, not size limits

  console.log("\n── The request ────────────────────────────────────────────────")
  console.log(`  POST ${url}/storage/v1/object/avatars/${path}  (x-upsert: true)`)

  // Raw fetch rather than supabase-js: storage-js collapses the response into
  // a message, and the status + body are exactly what the issue is missing.
  const res = await fetch(`${url}/storage/v1/object/avatars/${path}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/gif",
      "x-upsert": "true",
    },
    body,
  })
  const text = await res.text()
  console.log(`\n  status : ${res.status} ${res.statusText}`)
  console.log(`  body   : ${text}`)

  if (res.ok) {
    console.log(
      "\n  The upload SUCCEEDED with a real user token. The failure is then" +
        "\n  specific to the browser's session — check whether the browser client" +
        "\n  is sending a token at all (DevTools → Network → the storage request's" +
        "\n  Authorization header). An anon-only request produces this same" +
        "\n  RLS message."
    )
  } else {
    console.log(
      "\n  Reproduced outside the browser. Next probes, in order:" +
        "\n   1. SELECT name, owner FROM storage.objects WHERE bucket_id = 'avatars'" +
        "\n      — does a row already exist at this path, owned by someone else?" +
        "\n   2. SELECT * FROM storage.buckets WHERE id = 'avatars'" +
        "\n      — public, and no allowed_mime_types / file_size_limit surprises?" +
        "\n   3. SELECT policyname, cmd, roles, qual, with_check FROM pg_policies" +
        "\n      WHERE schemaname = 'storage' — do prod's four policies still match" +
        "\n      20260719000001_avatars_bucket.sql, and are they TO authenticated?"
    )
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
