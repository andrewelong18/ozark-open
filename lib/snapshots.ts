import type { createClient } from "@/lib/supabase/server"

// Bet-state snapshots (Sprint 11). One place that knows how to ask the database
// for a save state, so the manual button and the automatic pre-import hook can
// never drift into taking different kinds of snapshot.
//
// The work is all in Postgres — public.take_snapshot() builds the payload with
// to_jsonb() and prunes to the retention limit in the same call. This file is
// the thin edge: read the retention setting, call the function, and turn a
// failure into something a route can return.

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/** Why a snapshot was taken. Mirrors the CHECK constraint on snapshots.trigger. */
export type SnapshotTrigger = "cron" | "manual" | "pre-import"

/**
 * How many snapshots to keep. Generous by default: a jsonb dump of a 32-person
 * pool is a few hundred KB, so 50 of them is smaller than one round of photos
 * and buys a week of history during the tournament.
 *
 * Exported and pure so the parsing rules are testable — an unset, empty,
 * non-numeric or non-positive value all fall back to the default rather than
 * reaching the database, where a zero would ask it to prune everything.
 */
export const DEFAULT_SNAPSHOT_RETENTION = 50

export function snapshotRetention(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_SNAPSHOT_RETENTION
  const trimmed = raw.trim()
  if (trimmed === "") return DEFAULT_SNAPSHOT_RETENTION
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_SNAPSHOT_RETENTION
  }
  return parsed
}

export type SnapshotResult =
  | { ok: true; id: string }
  | { ok: false; message: string }

/**
 * Take one snapshot. Returns the new snapshot's id, or a message fit to show an
 * admin.
 *
 * The `error` from the RPC is checked rather than destructured away — the
 * mistake #132 catalogues across the rest of the app. Here it matters more than
 * usual: a snapshot that silently didn't happen is worse than no snapshot,
 * because the admin goes on to do the risky thing believing they're covered.
 */
export async function takeSnapshot(
  supabase: SupabaseClient,
  trigger: SnapshotTrigger,
  retention: number = snapshotRetention(process.env.SNAPSHOT_RETENTION)
): Promise<SnapshotResult> {
  const { data, error } = await supabase.rpc("take_snapshot", {
    p_trigger: trigger,
    p_keep: retention,
  })

  if (error) return { ok: false, message: error.message }
  if (typeof data !== "string" || data === "") {
    return { ok: false, message: "The database returned no snapshot id." }
  }
  return { ok: true, id: data }
}
