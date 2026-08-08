import { notFound } from "next/navigation"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// The admin gate, in one place (#81). Seven copies of this had accumulated —
// four pages and three API routes — each carrying its own
// `as { is_admin: boolean } | null` cast, which exists only because the repo
// has no generated DB types. Now the cast lives here.
//
// This is a readability fix, not a security fix. The real boundary is the
// database: RLS policies plus `public.is_admin()` decide what an admin session
// can actually write. These helpers exist so the app returns a clean 404 or
// 403 instead of a crash or an empty page.
//
// middleware.ts guards the `/admin` prefix for AUTHENTICATION only — being
// signed in, not being an admin — so it can't replace either of these.
//
// Two exports rather than one, because the two failure modes are genuinely
// different and must stay that way:
//
//   pages  → notFound(). A 403 would confirm the page exists; a 404 doesn't.
//   routes → 401/403 JSON, because a fetch caller needs to tell "sign in
//            again" apart from "you're not allowed".

type AdminRow = { is_admin: boolean } | null

/**
 * Gate an admin **page**. Returns the Supabase client for the caller to keep
 * using; never returns for a non-admin — `notFound()` throws.
 */
export async function requireAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle()
  if (!(profile as AdminRow)?.is_admin) notFound()

  return { supabase, user }
}

/**
 * Gate an admin **API route**. Returns either the client or a ready-to-return
 * error response, matching the union the routes already destructure:
 *
 *   const gate = await requireAdminRoute()
 *   if (gate.error) return gate.error
 *   const { supabase } = gate
 */
export async function requireAdminRoute(): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; user: { id: string }; error?: undefined }
  | { error: NextResponse; supabase?: undefined; user?: undefined }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle()
  if (!(profile as AdminRow)?.is_admin) {
    return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) }
  }

  return { supabase, user }
}
