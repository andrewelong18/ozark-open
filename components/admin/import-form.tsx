"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type ImportReport = {
  bets: { created: number; updated: number; unchanged: number }
  picks: { created: number; updated: number; unchanged: number }
  unmatchedPickNames: string[]
  warnings: string[]
  /** Sprint 11: the save state taken automatically just before this upload
   * applied. Optional only for defensiveness — the route always sends it. */
  snapshotId?: string | null
}

// Sprint 11: take a save state on demand. Sits above the upload because that's
// the order you want it in — snapshot, then do the risky thing — even though
// the import now takes its own snapshot automatically. This button is for the
// OTHER risky moments: a Studio edit, a bulk approval, anything about to be
// done by hand.
function SnapshotButton() {
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
        {taken && <SnapshotTaken id={taken} />}
        {error && <p className="text-sm font-medium text-loss-strong">{error}</p>}
      </CardContent>
    </Card>
  )
}

// The id is the whole point of showing anything: it's the argument to
// scripts/restore-snapshot.ts, and it's unguessable, so an admin who doesn't
// copy it now has to go find it in the database later.
function SnapshotTaken({ id }: { id: string }) {
  return (
    <div className="rounded-lg border border-win-border bg-win-surface p-3">
      <div className="text-sm font-semibold text-win-strong">
        ✓ Snapshot taken
      </div>
      <p className="mt-1 text-xs break-all text-text-muted">
        To roll back to this exact state:
        <br />
        <code className="tabular">
          node --experimental-strip-types scripts/restore-snapshot.ts {id} --yes
        </code>
      </p>
    </div>
  )
}

export function ImportForm() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contractErrors, setContractErrors] = useState<string[]>([])
  const [report, setReport] = useState<ImportReport | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = inputRef.current?.files?.[0]
    if (!file) return

    setBusy(true)
    setError(null)
    setContractErrors([])
    setReport(null)

    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/admin/import", { method: "POST", body })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        if (Array.isArray(json?.errors)) {
          setContractErrors(json.errors)
          // The headline is the server's when it sends one. A contract failure
          // rejects the file before a single write; a write that didn't land
          // (#159) happens AFTER the sheet was accepted and partly applied, and
          // telling an admin "nothing was imported" in that case would send
          // them looking for a problem in the spreadsheet.
          setError(json?.error ?? "The file was rejected — nothing was imported.")
        } else {
          setError(json?.error ?? `Upload failed (${res.status})`)
        }
        return
      }
      setReport(json?.report ?? null)
    } catch {
      setError("Upload failed — check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SnapshotButton />
      <Card>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <label
              htmlFor="import-file"
              className="text-sm font-semibold text-text-strong"
            >
              Bets spreadsheet
            </label>
            <input
              ref={inputRef}
              id="import-file"
              name="file"
              type="file"
              accept=".xlsx,.csv"
              required
              onChange={(e) => {
                setFileName(e.target.files?.[0]?.name ?? null)
                setError(null)
                setContractErrors([])
                setReport(null)
              }}
              className="block w-full cursor-pointer rounded-lg border border-border bg-surface-sunken text-sm text-text-muted file:mr-3 file:h-11 file:cursor-pointer file:border-0 file:bg-primary file:px-4 file:font-semibold file:text-primary-foreground"
            />
            <Button type="submit" disabled={busy || !fileName}>
              {busy ? "Importing…" : "Import"}
            </Button>
            {error && (
              <p className="text-sm font-medium text-loss-strong">{error}</p>
            )}
            {contractErrors.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 rounded-lg border border-loss-border bg-loss-surface py-3 pr-3 pl-8 text-sm text-loss-strong">
                {contractErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            )}
          </form>
        </CardContent>
      </Card>

      {report && <ImportReportCard report={report} />}
    </div>
  )
}

function CountRow({
  label,
  counts,
}: {
  label: string
  counts: { created: number; updated: number; unchanged: number }
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="text-sm font-semibold text-text-strong">{label}</div>
      <div className="tabular text-sm text-text-muted">
        {counts.created} created · {counts.updated} updated ·{" "}
        {counts.unchanged} unchanged
      </div>
    </div>
  )
}

function ImportReportCard({ report }: { report: ImportReport }) {
  const noChanges =
    report.bets.created +
      report.bets.updated +
      report.picks.created +
      report.picks.updated ===
    0

  return (
    <Card>
      <CardContent className="flex flex-col gap-3.5">
        <div className="font-heading text-lg text-text-strong">
          Import Report
        </div>

        {noChanges ? (
          <p className="text-sm text-text-muted">
            No changes — the menu already matches this sheet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <CountRow label="Bets" counts={report.bets} />
            <CountRow label="Picks" counts={report.picks} />
          </div>
        )}

        {report.warnings.length > 0 && (
          <div className="rounded-lg border border-caution-border bg-caution-surface p-3">
            <div className="text-sm font-semibold text-caution-strong">
              Warnings
            </div>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm text-caution-strong">
              {report.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* The undo, offered at the one moment an admin might want it: right
            after seeing what the upload actually did. Last in the card, below
            the counts and warnings that would prompt reaching for it. */}
        {report.snapshotId && (
          <div className="rounded-lg border border-border bg-surface-sunken p-3">
            <div className="text-sm font-semibold text-text-strong">
              Undo this import
            </div>
            <p className="mt-1 text-xs text-text-muted">
              A save state was taken before this upload applied. If the sheet
              was wrong, roll the whole menu back to how it was a moment ago:
            </p>
            <p className="mt-1.5 text-xs break-all text-text-muted">
              <code className="tabular">
                node --experimental-strip-types scripts/restore-snapshot.ts{" "}
                {report.snapshotId} --yes
              </code>
            </p>
          </div>
        )}

        {report.unmatchedPickNames.length > 0 && (
          <div>
            <div className="text-sm font-semibold text-text-strong">
              Picks without a player link
            </div>
            <p className="mt-0.5 text-xs text-text-muted">
              These pick names didn&apos;t match any user&apos;s display name.
              That&apos;s expected for &quot;Field&quot; and yes/no props — and
              for players who haven&apos;t logged in yet. Link those in Studio
              when their accounts exist.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {report.unmatchedPickNames.map((name) => (
                <span
                  key={name}
                  className="rounded-md border border-border bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-strong"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
