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
export type SnapshotTrigger = "cron" | "manual" | "pre-import" | "pre-restore"

/** The five money tables, parent-first — the same set and order as
 *  public.take_snapshot()'s payload, public.restore_snapshot()'s inserts and
 *  scripts/restore-snapshot.ts's TABLES. Four copies of one list is three too
 *  many, but the other three are SQL and this one is what the console renders
 *  rows from; keeping the order identical is what makes them comparable. */
export const SNAPSHOT_TABLES = [
  "tournaments",
  "tournament_participants",
  "bets",
  "bet_picks",
  "bet_placements",
] as const

export type SnapshotTable = (typeof SNAPSHOT_TABLES)[number]

/** One row of public.snapshot_index(). A count is null when the payload has no
 *  such key — an older take_snapshot() wrote it, and restore_snapshot() will
 *  refuse it, so the console must be able to say so rather than render a 0. */
export type SnapshotRow = {
  id: string
  created_at: string
  trigger: string
  bytes: number
} & Record<SnapshotTable, number | null>

/** Live row counts for the same five tables, for the confirm panel's deltas. */
export type LiveCounts = Record<SnapshotTable, number>

/** What restore_snapshot() hands back — the manifest the console prints. */
export type RestoreManifest = {
  restored_from: string
  taken_at: string
  trigger: string
  pre_restore_snapshot: string
  expected: Record<string, number>
  counts: Record<string, number>
  invites_restored: number
}

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

/**
 * The save-state listing, newest first.
 *
 * An RPC rather than a PostgREST select for two reasons that are not
 * stylistic, both spelled out in the migration: jsonb_array_length cannot be
 * expressed in a `select`, and `payload` is hundreds of KB per row — counting
 * client-side would mean selecting it and shipping megabytes to a phone.
 */
export async function listSnapshots(
  supabase: SupabaseClient,
  limit = 50
): Promise<{ ok: true; rows: SnapshotRow[] } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("snapshot_index", { p_limit: limit })

  if (error) return { ok: false, message: error.message }
  // Not `?? []`. That is the #132 shape: a failed read becomes an empty list,
  // and an empty list of save states is indistinguishable from having none —
  // on the one page whose whole job is to tell you what you can fall back to.
  if (!Array.isArray(data)) {
    return { ok: false, message: "The database returned no save-state listing." }
  }
  return { ok: true, rows: data as SnapshotRow[] }
}

/**
 * What the database holds RIGHT NOW, for the confirm panel's
 * "(N will be discarded)" deltas.
 *
 * Read through the admin's own session rather than a definer function, which
 * is honest here: the policy set gives an admin every row of all five tables
 * (Admins can read all bets / bet_picks / placements; tournaments and
 * participants are readable by any authenticated user), so these are true
 * counts and not a filtered view.
 *
 * A failed count is a failure, never a zero. /admin/close already carries the
 * reason: a count that reads as 0 because the read broke says "there is
 * nothing here to lose", which is the exact wrong thing to guess at in front
 * of a destructive button.
 */
export async function liveCounts(
  supabase: SupabaseClient
): Promise<{ ok: true; counts: LiveCounts } | { ok: false; message: string }> {
  const results = await Promise.all(
    SNAPSHOT_TABLES.map(async (table) => {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
      return { table, count, error }
    })
  )

  const counts = {} as LiveCounts
  for (const { table, count, error } of results) {
    if (error) return { ok: false, message: `${table}: ${error.message}` }
    if (typeof count !== "number") {
      return { ok: false, message: `${table}: the database returned no count.` }
    }
    counts[table] = count
  }
  return { ok: true, counts }
}

/**
 * Roll the money tables back to a save state.
 *
 * All of the work — and all of the safety — is in public.restore_snapshot():
 * one transaction, a pre-restore snapshot first, the entry-fee guard stood
 * down, tournament_invites preserved. This is the thin edge, and it must not
 * grow a second opinion about any of that.
 */
export async function restoreSnapshot(
  supabase: SupabaseClient,
  snapshotId: string
): Promise<{ ok: true; manifest: RestoreManifest } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("restore_snapshot", { p_id: snapshotId })

  if (error) return { ok: false, message: error.message }
  // A restore that silently restored nothing is exactly as dangerous as an
  // export that silently captured nothing (db-export.sh's lesson). The manifest
  // is the proof it happened, so its absence is a failure and not a shrug.
  if (!data || typeof data !== "object" || !("pre_restore_snapshot" in data)) {
    return { ok: false, message: "The database returned no restore manifest." }
  }
  return { ok: true, manifest: data as RestoreManifest }
}

/**
 * "(3 will be discarded)" / "(2 will come back)" / "" — the confirm panel's
 * delta note for one table.
 *
 * Word for word the strings scripts/restore-snapshot.ts prints, so an admin who
 * has run the script and an admin reading the console are told the same thing
 * in the same words. Pure, so the one piece of restore copy that can be pinned
 * by a unit test is pinned by one.
 */
export function describeDelta(current: number, saved: number): string {
  const delta = current - saved
  if (delta === 0) return ""
  return delta > 0
    ? `(${delta} will be discarded)`
    : `(${-delta} will come back)`
}
