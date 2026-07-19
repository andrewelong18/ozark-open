import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { parseProfileBody, validateProfile } from "@/lib/profile"

// Self-serve profile endpoint (Sprint 15). The route is glue: authenticate,
// let lib/profile.ts validate, then write nickname (+ a fresh avatar URL) to
// the caller's own users row. The avatar file itself is uploaded browser →
// Storage under the user's own folder; here we only derive its public URL, so
// the client can never point avatar_url at anything but its own bucket path.
// The own-row UPDATE RLS policy + the guard trigger are the real authorization
// — display_name and is_admin can't be touched from here.
export async function PATCH(request: Request) {
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

  const parsed = parseProfileBody(raw)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const verdict = validateProfile(parsed.value)
  if (!verdict.ok) {
    return NextResponse.json({ errors: verdict.errors }, { status: 400 })
  }

  const update: { nickname: string | null; avatar_url?: string } = {
    nickname: parsed.value.nickname,
  }
  if (parsed.value.avatarUpdated) {
    // Fixed path per user; the cache-buster forces <img> to re-fetch after a
    // re-upload to the same object.
    const { data: pub } = supabase.storage
      .from("avatars")
      .getPublicUrl(`${user.id}/avatar`)
    update.avatar_url = `${pub.publicUrl}?v=${Date.now()}`
  }

  const { data, error } = await supabase
    .from("users")
    .update(update)
    .eq("id", user.id)
    .select("display_name, nickname, avatar_url, is_admin")
    .single()
  if (error) {
    return NextResponse.json(
      { error: `Couldn't save your profile: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ profile: data })
}
