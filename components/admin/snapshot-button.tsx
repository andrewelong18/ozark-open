"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

// Take a save state on demand (Sprint 11; lifted out of import-form.tsx in
// Sprint 27 so both /admin/import and /admin/snapshots can show it).
//
// On the import page it sits above the upload, because that's the order you
// want it in — snapshot, then do the risky thing — even though the import now
// takes its own snapshot automatically. This button is for the OTHER risky
// moments: a Studio edit, a bulk approval, anything about to be done by hand.

export function SnapshotButton({
  /** True on /admin/snapshots, where the list is already on screen and a link
   *  to the page you are standing on would be nonsense. */
  inConsole = false,
  /** Let the console refresh its listing so the new save state appears. */
  onTaken,
}: {
  inConsole?: boolean
  onTaken?: () => void
} = {}) {
  const [busy, setBusy] = useState(false)
  const [taken, setTaken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function snapshot() {
    setBusy(true)
    setError(null)
    setTaken(null)
    try {
      const res = await fetch("/api/admin/snapshot", { method: "POST" })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? `Snapshot failed (${res.status})`)
        return
      }
      setTaken(json?.id ?? null)
      onTaken?.()
    } catch {
      setError("Snapshot failed — check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3.5">
        <div>
          <div className="font-heading text-lg text-text-strong">Save state</div>
          <p className="mt-0.5 text-sm text-text-muted">
            Snapshots the bets, picks, wagers, participants and tournament row
            as they are right now. Take one before editing anything by hand.
            Imports snapshot themselves.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={snapshot} disabled={busy}>
          {busy ? "Taking snapshot…" : "Snapshot now"}
        </Button>
        {taken && <SnapshotTaken id={taken} inConsole={inConsole} />}
        {error && <p className="text-sm font-medium text-loss-strong">{error}</p>}
      </CardContent>
    </Card>
  )
}

// Sprint 27 retargeted this. It used to print the scripts/restore-snapshot.ts
// command line, which was the honest answer while that was the only way back —
// and became wrong-by-omission the moment /admin/snapshots shipped, since the
// admin reading it is on a phone and the command needs a laptop with psql.
function SnapshotTaken({ id, inConsole }: { id: string; inConsole: boolean }) {
  return (
    <div className="rounded-lg border border-win-border bg-win-surface p-3">
      <div className="text-sm font-semibold text-win-strong">✓ Snapshot taken</div>
      <p className="mt-1 text-xs text-text-muted">
        {inConsole ? (
          <>It&rsquo;s at the top of the list below when you need it.</>
        ) : (
          <>
            Roll back to this exact state from{" "}
            <Link href="/admin/snapshots" className="font-semibold text-indigo-700 underline">
              Save States &amp; Undo
            </Link>
            .
          </>
        )}
      </p>
      {/* The id is still worth showing: it's unguessable, it's what
          scripts/restore-snapshot.ts takes when the app itself is down, and
          it's how you tell two save states a minute apart from each other. */}
      <p className="mt-1 text-xs break-all text-text-muted">
        <code className="tabular">{id}</code>
      </p>
    </div>
  )
}
