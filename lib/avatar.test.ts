// Unit tests for lib/avatar.ts (#90).
//
// The root cause was a race between session hydration and the storage call,
// which no amount of policy testing would have caught — the policies were
// correct. What these pin is the ordering contract: the session is resolved
// BEFORE the upload, and a missing session never reaches Storage at all.

import test from "node:test"
import assert from "node:assert/strict"
import { avatarPath, uploadAvatar, type AvatarUploadClient } from "./avatar.ts"

const FILE = new Blob(["x".repeat(1024)], { type: "image/png" })
const ME = "873b4df3-6077-4cbe-8d32-cd9a6fc475e5"

/** Records what the client was asked to do, in order. */
function fakeClient(opts: {
  session?: { user?: { id?: string } } | null
  uploadError?: string | null
}) {
  const calls: string[] = []
  const uploads: { path: string; options: unknown }[] = []
  const client: AvatarUploadClient = {
    auth: {
      getSession: async () => {
        calls.push("getSession")
        return { data: { session: opts.session ?? null } }
      },
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path, _file, options) => {
          calls.push(`upload:${bucket}`)
          uploads.push({ path, options })
          return {
            error: opts.uploadError ? { message: opts.uploadError } : null,
          }
        },
      }),
    },
  }
  return { client, calls, uploads }
}

test("avatarPath is the <uid>/ prefix the bucket policy enforces", () => {
  assert.equal(avatarPath(ME), `${ME}/avatar`)
})

test("the session is resolved BEFORE the upload — the #90 ordering", async () => {
  const { client, calls } = fakeClient({ session: { user: { id: ME } } })
  assert.equal(await uploadAvatar(client, ME, FILE), null)
  assert.deepEqual(calls, ["getSession", "upload:avatars"])
})

test("no session means no request at all, and a message that isn't about RLS", async () => {
  const { client, calls } = fakeClient({ session: null })
  const error = await uploadAvatar(client, ME, FILE)
  assert.equal(error, "You're signed out — refresh the page and try again.")
  // The bug was that this case DID reach Storage, anonymously, and came back
  // as "new row violates row-level security policy".
  assert.deepEqual(calls, ["getSession"], "Storage must not be touched")
  assert.doesNotMatch(error!, /row-level security/)
})

test("uploading as a different user is refused before Storage sees it", async () => {
  const { client, calls } = fakeClient({ session: { user: { id: "someone-else" } } })
  const error = await uploadAvatar(client, ME, FILE)
  assert.match(error!, /signed in as someone else/)
  assert.deepEqual(calls, ["getSession"])
})

test("the upload targets the member's own folder, upserting", async () => {
  const { client, uploads } = fakeClient({ session: { user: { id: ME } } })
  await uploadAvatar(client, ME, FILE)
  assert.equal(uploads[0].path, `${ME}/avatar`)
  assert.deepEqual(uploads[0].options, {
    upsert: true,
    contentType: "image/png",
  })
})

test("an oversize file is rejected without a round trip", async () => {
  const { client, calls } = fakeClient({ session: { user: { id: ME } } })
  const oversize = new Blob(["x".repeat(3 * 1024 * 1024)], { type: "image/png" })
  const error = await uploadAvatar(client, ME, oversize)
  assert.match(error!, /over 2 MB/)
  assert.deepEqual(calls, [])
})

test("a genuine Storage error still surfaces verbatim", async () => {
  const { client } = fakeClient({
    session: { user: { id: ME } },
    uploadError: "Payload too large",
  })
  assert.equal(
    await uploadAvatar(client, ME, FILE),
    "Uploading your photo failed: Payload too large"
  )
})

test("a session without a user id still uploads — the id check is opportunistic", async () => {
  const { client, calls } = fakeClient({ session: {} })
  assert.equal(await uploadAvatar(client, ME, FILE), null)
  assert.deepEqual(calls, ["getSession", "upload:avatars"])
})
