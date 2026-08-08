// Avatar upload (Sprint 15, fixed Sprint 21+ / #90).
//
// Pure module by design — no Supabase import, no "@/" alias imports — so the
// node:test suite exercises the exact code the browser runs. The Supabase
// client is passed in structurally.
//
// WHY THIS EXISTS RATHER THAN TWO INLINE COPIES. Onboarding and /profile had
// identical upload blocks, and both had the same bug: they created a fresh
// browser client and called storage.upload() immediately.
//
// createBrowserClient() (@supabase/ssr) hydrates its session from cookies
// ASYNCHRONOUSLY. supabase.storage builds its Authorization header from
// whatever access token the client holds at request time — so a call that
// races hydration goes out carrying only the anon key. The request then runs
// as `anon`, auth.uid() is NULL, and the bucket's INSERT policy (which is
// granted TO authenticated) simply doesn't apply. No permissive policy
// matches, and Storage returns:
//
//     new row violates row-level security policy
//
// which reads like a broken policy and is nothing of the kind. Verified
// against production on 2026-08-08: with a real member's JWT, the same INSERT
// succeeds, so the four avatar policies were correct all along.
//
// Awaiting getSession() forces hydration and guarantees the JWT is attached.
// Onboarding is where this bit (gameplan Act 1.3): it's a fresh page load
// where submitting is often the user's first interaction, so the race is
// widest exactly when ~32 people hit it on one evening.

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
 * The session check is the fix for #90 and is not defensive padding: without
 * it the upload silently degrades to an anonymous request whose failure
 * message blames RLS.
 */
export async function uploadAvatar(
  client: AvatarUploadClient,
  userId: string,
  file: UploadableFile
): Promise<string | null> {
  if (file.size > AVATAR_MAX_BYTES) {
    return "That image is over 2 MB — pick a smaller one."
  }

  // Forces the browser client to finish reading its session from cookies.
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
