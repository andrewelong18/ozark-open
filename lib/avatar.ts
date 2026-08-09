// Avatar upload (Sprint 15, fixed Sprint 21+ / #90).
//
// Pure module by design — no Supabase import, no "@/" alias imports — so the
// node:test suite exercises the exact code the browser runs. The Supabase
// client is passed in structurally.
//
// WHY THIS EXISTS RATHER THAN TWO INLINE COPIES. Onboarding and /profile had
// identical upload blocks, and identical unhelpful failure behaviour.
//
// WHAT #90 ACTUALLY IS, corrected 2026-08-09. The original fix commit and the
// issue thread both explained the failure as a race: createBrowserClient()
// hydrates from cookies asynchronously, so an upload firing before hydration
// supposedly went out with only the anon key. THAT MECHANISM IS NOT REAL, and
// the correction matters because it is the reason nobody should "fix" this
// again by reordering awaits.
//
// supabase-js builds the storage client with its own fetch wrapper
// (SupabaseClient.ts: `this.storage = new SupabaseStorageClient(url,
// this.headers, this.fetch, …)` where `this.fetch = fetchWithAuth(key,
// this._getAccessToken.bind(this))`). fetchWithAuth awaits getAccessToken() on
// EVERY request, and _getAccessToken() awaits this.auth.getSession(). So the
// session is already awaited before the Authorization header is set — an
// application-level `await getSession()` cannot change which token is sent.
// Verified against @supabase/supabase-js 2.105.3 in this repo's lockfile, and
// empirically: e2e/avatar-upload.spec.ts passes with these checks removed.
//
// The four bucket policies are also correct, verified directly against
// production on 2026-08-09 (pg_policies on storage.objects, plus the bucket's
// public/file_size_limit/allowed_mime_types). So is every auth.users row's
// role and aud. The true trigger for Pat's failure on 2026-07-31 was never
// captured and is now unreproducible.
//
// WHAT THIS MODULE IS GOOD FOR, stated honestly. _getAccessToken() falls back
// to the anon key when there is genuinely no session, and an anon request
// against the bucket's `TO authenticated` policies fails with exactly:
//
//     new row violates row-level security policy
//
// which reads like a broken policy and is nothing of the kind. That remains
// the most plausible explanation for the original report, and the checks below
// turn it into a sentence a member can act on. This is better error handling
// for the likeliest cause — not a repaired race.

/** The slice of the Supabase client this needs — structural, so tests can
 *  hand in a fake and the real client satisfies it without a cast. */
export type AvatarUploadClient = {
  auth: {
    getSession: () => Promise<{
      data: { session: { user?: { id?: string } } | null }
    }>
  }
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: Blob,
        options: { upsert: boolean; contentType: string }
      ) => Promise<{ error: { message: string } | null }>
    }
  }
}

/** A File is a Blob; typing it as Blob keeps this module free of DOM-only
 *  types so node:test can hand in a real one. */
export type UploadableFile = Blob

/** Where a member's avatar lives. The bucket's RLS enforces this prefix, so
 *  the shape is a contract, not a convention. */
export function avatarPath(userId: string): string {
  return `${userId}/avatar`
}

export const AVATAR_BUCKET = "avatars"
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/**
 * Upload a member's avatar. Returns a human-readable error message, or null
 * on success.
 *
 * The session check does not change what the request sends (see the header
 * note) — it changes what a signed-out member is TOLD. Without it the upload
 * goes out anonymously and reports an RLS violation, which sends whoever is
 * helping them off to read storage policies that were never wrong.
 */
export async function uploadAvatar(
  client: AvatarUploadClient,
  userId: string,
  file: UploadableFile
): Promise<string | null> {
  if (file.size > AVATAR_MAX_BYTES) {
    return "That image is over 2 MB — pick a smaller one."
  }

  // NOT load-bearing for which token gets attached — supabase-js already
  // awaits getSession() inside its own fetch wrapper (see the header note).
  // This is here to answer "is there a session at all?" so a signed-out member
  // gets a sentence instead of an RLS string.
  const {
    data: { session },
  } = await client.auth.getSession()
  if (!session) {
    return "You're signed out — refresh the page and try again."
  }

  // The signed-in user must be the folder owner, or the bucket policy will
  // reject the write. Catching it here turns a confusing RLS error into a
  // sentence, and catches a userId prop that has gone stale.
  const sessionUserId = session.user?.id
  if (sessionUserId && sessionUserId !== userId) {
    return "You're signed in as someone else — refresh the page and try again."
  }

  const { error } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(avatarPath(userId), file, {
      upsert: true,
      contentType: file.type,
    })

  return error ? `Uploading your photo failed: ${error.message}` : null
}
