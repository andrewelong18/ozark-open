import { requireAdminPage } from "@/lib/admin-gate"
import { AdminBackLink } from "@/components/admin/admin-back-link"
import { SnapshotsConsole } from "@/components/admin/snapshots-console"
import { LoadError } from "@/components/modules/load-error"
import { listSnapshots, liveCounts } from "@/lib/snapshots"

// /admin/snapshots (Sprint 27 / #196) — the save states, and the button that
// rolls back to one.
//
// This page exists because Sprint 23 settled that Pat runs the tournament
// without database access, and the restore was the last hole in that: the tool
// for the most likely weekend disaster (uploading last week's sheet,
// fat-fingering a cell at 10pm) needed a laptop with psql on it. PRD §12 A21
// records the reversal of Sprint 11's "no restore UI".
//
// Non-admins get a 404, same pattern as every other admin page — a 403 would
// confirm the page exists.

export default async function AdminSnapshotsPage() {
  const { supabase } = await requireAdminPage()

  const [index, counts] = await Promise.all([
    listSnapshots(supabase),
    liveCounts(supabase),
  ])

  // A list that renders empty because the read failed is indistinguishable
  // from having no save states — #132's exact shape, and on the one page whose
  // whole job is to tell you what you can fall back to. The shell stays so an
  // admin can leave without the browser's back button.
  if (!index.ok || !counts.ok) {
    console.error(
      "[admin/snapshots] read failed:",
      index.ok ? (counts.ok ? "" : counts.message) : index.message
    )
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <AdminBackLink />
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          Save states
        </h1>
        <LoadError subject="the save states" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <AdminBackLink />
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          Save states
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Every save state, newest first — and the way back to one.
        </p>
      </div>

      <SnapshotsConsole snapshots={index.rows} current={counts.counts} />

      <p className="text-center text-xs text-text-muted">
        Save states are taken automatically before every import, every six hours
        on a schedule, and whenever you press Snapshot now. They cover the bets,
        picks, wagers, participants and tournament row — not accounts, invites
        or avatars.
      </p>
    </div>
  )
}
