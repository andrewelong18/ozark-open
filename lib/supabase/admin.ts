// The ONE place this project holds a service-role key (#124).
//
// Read this before importing it anywhere.
//
// ---------------------------------------------------------------------------
// What it is
//
// A Supabase client authenticated with SUPABASE_SERVICE_ROLE_KEY, which
// BYPASSES ROW-LEVEL SECURITY ENTIRELY. Not "has admin permissions" — it is
// outside the permission system. Every policy in supabase/migrations/ is inert
// against this client.
//
// ---------------------------------------------------------------------------
// Why it exists at all
//
// public.users.id REFERENCES auth.users(id), so an account cannot exist without
// a GoTrue row, and creating one is not something the anon key can do. Pat asked
// for this during the Jul 31 dry run: some members won't get through the
// magic-link flow, and he needs to add them himself and bet for them (#101).
// The wager half shipped in Sprint 23; this is the account half.
//
// Three alternatives were considered and rejected (ADR 0001 §14): a
// SECURITY DEFINER function hand-writing auth.users + auth.identities (GoTrue's
// internal tables, unverifiable locally, breakable by a Supabase auth upgrade),
// shadow users with the FK dropped (the member can never cleanly claim the
// account), and an admin-triggered invite (still an email round-trip, so it
// doesn't solve the problem).
//
// ---------------------------------------------------------------------------
// The cost, stated plainly
//
// DATA_MODEL.md §5 argued against putting a full-bypass key in the runtime, and
// Sprint 11 chose Supabase pg_cron over Vercel Cron specifically to avoid
// introducing this key for a nightly backup. That reasoning was correct and is
// not being retracted — it is being overridden ONCE, for the one feature that
// cannot be built without it. If the Vercel environment leaks, this key is the
// whole database.
//
// ---------------------------------------------------------------------------
// The containment, which is the whole mitigation
//
//   1. `import "server-only"` — importing this from a Client Component is a
//      BUILD error, not a runtime surprise.
//   2. Exactly ONE importer: app/api/admin/members/route.ts. Pinned by a unit
//      test (lib/admin-client-containment.test.ts) so a later refactor cannot
//      quietly widen the blast radius.
//   3. That route does exactly one thing with it — create the auth account.
//      Every other write in the flow (the public.users profile, the
//      tournament_participants row) goes through the ADMIN'S OWN SESSION and is
//      authorized by RLS, so "RLS is the real boundary" stays true instead of
//      becoming something we route around because it was convenient.
//   4. The key is never NEXT_PUBLIC_*, never imported into middleware, and
//      never used to read.
//
// If you are here to use this client for something else: don't. Add the policy
// the anon path needs instead, or a SECURITY DEFINER function like
// public.admin_auth_activity(). Widening rule 2 is the thing this file exists
// to prevent.

import "server-only"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/** Thrown when the env var is missing, so the caller can answer 503 with
 *  something an admin can act on rather than a 500 stack trace. The feature is
 *  inert until SUPABASE_SERVICE_ROLE_KEY is set in Vercel — on a deploy without
 *  it, everything else in the app keeps working. */
export class AdminClientUnavailableError extends Error {
  constructor(missing: string) {
    super(
      `Account creation isn't configured on this deployment — ${missing} is not set. ` +
        `Set it in Vercel → Settings → Environment Variables (see README).`
    )
    this.name = "AdminClientUnavailableError"
  }
}

/**
 * Build the service-role client. Throws `AdminClientUnavailableError` rather
 * than returning a half-configured client, so a missing key fails at the call
 * site with a legible message instead of as a 401 from PostgREST.
 *
 * No session persistence and no token refresh: this client is constructed per
 * request, used for a single call, and discarded. Persisting anything would
 * mean a service-role session sitting in module state across requests.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new AdminClientUnavailableError("NEXT_PUBLIC_SUPABASE_URL")
  if (!serviceRoleKey) throw new AdminClientUnavailableError("SUPABASE_SERVICE_ROLE_KEY")

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
