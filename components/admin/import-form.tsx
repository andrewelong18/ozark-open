"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { SnapshotButton } from "@/components/admin/snapshot-button"
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
  /** Sprint 28: whether this can be the FINAL upload — the same two counts
   * /api/admin/close runs, through the same finalizeReadiness(). Optional for
   * the same defensiveness. */
  readyToFinalize?: { ok: boolean; blockers: string[] } | null
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
              was wrong, roll the whole menu back to how it was a moment ago
              from{" "}
              <Link
                href="/admin/snapshots"
                className="font-semibold text-indigo-700 underline"
              >
                Save States &amp; Undo
              </Link>
              {" "}— it&rsquo;s the newest <span className="font-semibold">pre-import</span>{" "}
              one:
            </p>
            <p className="mt-1.5 text-xs break-all text-text-muted">
              <code className="tabular">{report.snapshotId}</code>
            </p>
          </div>
        )}

        {report.readyToFinalize && (
          <PostLeaderboard readiness={report.readyToFinalize} />
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

/**
 * The post, offered — never taken automatically.
 *
 * Pat's ask was that the leaderboard go up "when pat uploads his spreadsheet
 * for the final time". It goes up on the tap right here, one step after that
 * upload, and that step is the point: publishing ~32 people's payouts as a side
 * effect of a file upload removes the one moment where somebody reads the
 * numbers before everybody else does, which is the entire reason
 * finalizeReadiness() was built (Sprint 25 / #108).
 *
 * When it is NOT ready, this shows the blockers. That is the more useful half
 * on most uploads: those blockers are exactly what has to be fixed in the
 * sheet, and until now finding them meant walking to another page.
 *
 * It posts through POST /api/admin/close, which stays the only writer of
 * tournaments.status and re-runs the same guard server-side. Nothing here is
 * trusted; this is a button, not an authority.
 */
function PostLeaderboard({
  readiness,
}: {
  readiness: { ok: boolean; blockers: string[] }
}) {
  const [busy, setBusy] = useState(false)
  const [posted, setPosted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function post() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize" }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(
          Array.isArray(json?.errors)
            ? json.errors.join(" ")
            : (json?.error ?? `Posting failed (${res.status})`)
        )
        return
      }
      setPosted(true)
    } catch {
      setError("Posting failed — check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  if (posted) {
    return (
      <div className="rounded-lg border border-win-border bg-win-surface p-3">
        <div className="text-sm font-semibold text-win-strong">
          The leaderboard is up.
        </div>
        <p className="mt-1 text-xs text-win-strong">
          Every member&rsquo;s dashboard is now the final standings. If that was
          a mistake, take it back down from{" "}
          <Link href="/admin/close" className="font-semibold underline">
            the close console
          </Link>
          .
        </p>
      </div>
    )
  }

  if (!readiness.ok) {
    return (
      <div className="rounded-lg border border-border bg-surface-sunken p-3">
        <div className="text-sm font-semibold text-text-strong">
          Not the final upload yet
        </div>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-xs text-text-muted">
          {readiness.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gold-200 bg-gold-100 p-3">
      <div className="text-sm font-semibold text-text-strong">
        Every bet is settled — ready to post
      </div>
      <p className="mt-1 text-xs text-text-muted">
        This swaps every member&rsquo;s dashboard to the final standings. Read
        the numbers first; you can take it back down afterwards.
      </p>
      <Button
        variant="gold"
        size="sm"
        className="mt-2.5 h-11 sm:h-9"
        disabled={busy}
        onClick={post}
      >
        {busy ? "Posting…" : "Post the leaderboard"}
      </Button>
      {error && (
        <p className="mt-2 text-sm font-medium text-loss-strong">{error}</p>
      )}
    </div>
  )
}
