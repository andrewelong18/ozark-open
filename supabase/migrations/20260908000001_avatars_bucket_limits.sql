-- #144: give the avatars bucket the size and MIME limits it never had.
--
-- 20260719000001_avatars_bucket.sql inserted the bucket with only
-- (id, name, public), so file_size_limit and allowed_mime_types were both
-- NULL — the bucket accepted ANY size up to the project-global cap and ANY
-- MIME type. The limits members actually experienced lived only in
-- lib/avatar.ts and the two upload forms, and per CLAUDE.md client checks are
-- UX, not security. Anyone who could sign in could POST a 500 MB file, or an
-- SVG, straight to /storage/v1/object/avatars/<their-uid>/avatar: the bucket
-- policies constrain the path PREFIX, not the payload. Free-tier storage is
-- 1 GB, and ~32 people upload photos over one September fortnight.
--
-- WHY A NEW MIGRATION RATHER THAN AN EDIT TO THE ORIGINAL. That INSERT carries
-- ON CONFLICT (id) DO NOTHING, so re-running it can never correct a bucket
-- that already exists — which is precisely why this drifted unnoticed for
-- seven weeks. Correcting the old file would fix nothing in production.
--
-- The numbers are deliberately the same ones lib/avatar.ts enforces
-- (AVATAR_MAX_BYTES, AVATAR_MIME_TYPES), so client and server cannot disagree
-- about what a valid avatar is. Change one, change the other.

UPDATE storage.buckets
   SET file_size_limit    = 2097152,  -- 2 MB, matches AVATAR_MAX_BYTES
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 WHERE id = 'avatars';
