import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { parseOnboardingBody, validateOnboarding } from "@/lib/profile"

// Onboarding endpoint (Sprint 16). The required first-run write: set the
// member's own display_name (once — the DB guard lets it through only while
// onboarded_at IS NULL), an optional nickname, an optional avatar URL, and
// stamp onboarded_at so the middleware stops forcing /onboarding. Runs under
// the caller's own session; the avatar file itself was uploaded browser →
// Storage under the user's own folder (same as /api/profile), so we only
// derive its public URL here.
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  let raw: unknown = null
  try {
    raw = await request.json()
  } catch {}

  const parsed = parseOnboardingBody(raw)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const verdict = validateOnboarding(parsed.value)
  if (!verdict.ok) {
    return NextResponse.json({ errors: verdict.errors }, { status: 400 })
  }

  const update: {
    display_name: string
    nickname: string | null
    onboarded_at: string
    avatar_url?: string
  } = {
    display_name: parsed.value.displayName,
    nickname: parsed.value.nickname,
    onboarded_at: new Date().toISOString(),
  }
  if (parsed.value.avatarUpdated) {
    const { data: pub } = supabase.storage
      .from("avatars")
      .getPublicUrl(`${user.id}/avatar`)
    update.avatar_url = `${pub.publicUrl}?v=${Date.now()}`
  }

  const { data, error } = await supabase
    .from("users")
    .update(update)
    .eq("id", user.id)
    .select("display_name, nickname, avatar_url, onboarded_at")
    .single()
  if (error) {
    return NextResponse.json(
      { error: `Couldn't finish setting up your profile: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ profile: data })
}
