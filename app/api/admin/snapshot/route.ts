import { NextResponse } from "next/server"
import { requireAdminRoute } from "@/lib/admin-gate"
import { takeSnapshot } from "@/lib/snapshots"

// "Snapshot now" (Sprint 11). Writes one save state of the money tables on
// demand, from the button on /admin/import.
//
// The route is thin on purpose: public.take_snapshot() does the work in one
// statement, so there is no window where a snapshot is half-written. The admin
// gate here is for a clean 401/403 — the real boundary is the function's own
// internal check, which a forged request can't route around.
//
// There is no GET. Scheduled snapshots run on Supabase pg_cron, inside the
// database (see the migration's closing comment), which is what keeps a
// service-role key out of this app entirely.

export async function POST() {
  const gate = await requireAdminRoute()
  if (gate.error) return gate.error
  const { supabase } = gate

  const result = await takeSnapshot(supabase, "manual")
  if (!result.ok) {
    return NextResponse.json(
      { error: `Couldn't take a snapshot: ${result.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ id: result.id })
}
