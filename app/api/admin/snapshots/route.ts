import { NextResponse } from "next/server"
import { requireAdminRoute as requireAdmin } from "@/lib/admin-gate"
import { listSnapshots, liveCounts, restoreSnapshot } from "@/lib/snapshots"

// The save-state console's data (Sprint 27 / #196).
//
// GET returns the listing AND the live row counts together, because the
// confirm panel needs both to say "(3 will be discarded)" — and it needs them
// fresh. The page renders the same two reads server-side; this route is what
// re-reads them at the moment an admin opens a confirm panel, so the number
// they are shown before pressing a destructive button isn't left over from a
// page load twenty minutes earlier.
//
// POST restores. The route is thin on purpose: public.restore_snapshot() is one
// transaction that takes its own pre-restore snapshot, stands the entry-fee
// guard down and preserves tournament_invites. Nothing here may develop a
// second opinion about any of that — the admin gate below is for a clean
// 401/403, and the real boundary is the function's own internal check, which a
// forged request can't route around.
//
// The singular /api/admin/snapshot is left alone: the import page's
// Snapshot-now button posts to it and nothing is gained by moving it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function asObject(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>)
    : null
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const [index, counts] = await Promise.all([
    listSnapshots(supabase),
    liveCounts(supabase),
  ])

  // Both or neither. A listing without live counts would render deltas against
  // nothing, and a delta computed from a missing number is worse than no delta
  // — it is a wrong number in front of a destructive button.
  if (!index.ok) {
    return NextResponse.json(
      { error: `Couldn't read the save states: ${index.message}` },
      { status: 500 }
    )
  }
  if (!counts.ok) {
    return NextResponse.json(
      { error: `Couldn't count what's in the database now: ${counts.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ snapshots: index.rows, current: counts.counts })
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = asObject(await readJson(request))
  if (!body) {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 })
  }
  if (body.action !== "restore") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  }
  if (typeof body.snapshotId !== "string" || !UUID.test(body.snapshotId)) {
    return NextResponse.json({ error: "Missing or malformed snapshotId." }, { status: 400 })
  }

  const result = await restoreSnapshot(supabase, body.snapshotId)
  if (!result.ok) {
    // The function's refusals — a missing save state, a payload written by an
    // older take_snapshot(), a snapshot referencing a deleted account — are all
    // written to be read by a person standing in a clubhouse, so they are
    // passed through rather than flattened into "something went wrong".
    return NextResponse.json(
      { error: `The restore did not happen: ${result.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ manifest: result.manifest })
}
