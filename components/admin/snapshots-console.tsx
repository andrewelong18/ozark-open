"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SnapshotButton } from "@/components/admin/snapshot-button"
import { formatRelativeTime, formatTimestamp } from "@/lib/format"
import {
  SNAPSHOT_TABLES,
  describeDelta,
  type LiveCounts,
  type RestoreManifest,
  type SnapshotRow,
  type SnapshotTable,
} from "@/lib/snapshots"

// The client half of /admin/snapshots (Sprint 27 / #196).
//
// THIS IS THE FIRST DESTRUCTIVE BUTTON IN THE APP, and the ceremony around it
// is the point rather than decoration. Pat's ask was "it should confirm I want
// to replace so that I don't fat finger it unintentionally"; Andrew's call
// (Sept 7) was that confirming means a typed word over a panel naming exactly
// what is about to be discarded.
//
// The safety that does NOT depend on a human reading carefully lives in
// public.restore_snapshot(): one transaction, a pre-restore save state written
// first, the entry-fee guard stood down, tournament_invites preserved. Nothing
// here decides anything — the panel below only explains.
//
// Inline confirm rather than a modal, matching every other destructive control
// in this app (people-console's Revoke, bet-placement-card's Remove). No admin
// surface uses a dialog, and Base UI's dismiss-on-outside-click is the wrong
// behaviour for a form you are half way through on a phone.

// Every button here is pressed standing on a golf course, in the dark, on the
// evening something has already gone wrong. sm draws a 36px control, which is
// right for a dense desktop admin and wrong here.
const TOUCH = "h-11 sm:h-9"

const CONFIRM_WORD = "RESTORE"

const TABLE_LABELS: Record<SnapshotTable, string> = {
  tournaments: "Tournament row",
  tournament_participants: "Participants",
  bets: "Bets",
  bet_picks: "Picks",
  bet_placements: "Wagers",
}

function triggerTone(trigger: string) {
  if (trigger === "pre-restore") return "amber" as const
  if (trigger === "pre-import") return "indigo" as const
  if (trigger === "manual") return "secondary" as const
  return "neutral" as const
}

export function SnapshotsConsole({
  snapshots,
  current,
}: {
  snapshots: SnapshotRow[]
  current: LiveCounts
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string[] | null>(null)
  const [done, setDone] = useState<RestoreManifest | null>(null)
  // Refreshed when a confirm panel opens, so "(3 will be discarded)" is the
  // number as of now rather than as of whenever this page was rendered.
  const [live, setLive] = useState<LiveCounts>(current)

  async function openConfirm(id: string) {
    setConfirming(id)
    setError(null)
    setDone(null)
    try {
      const res = await fetch("/api/admin/snapshots")
      const data = await res.json()
      if (res.ok && data.current) setLive(data.current as LiveCounts)
    } catch {
      // A stale delta is worth showing; a blank panel is not. The server
      // re-reads everything anyway, and the manifest afterwards is the truth.
    }
  }

  async function restore(id: string) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch("/api/admin/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", snapshotId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.errors ?? [data.error ?? "Something went wrong."])
        return
      }
      setDone(data.manifest as RestoreManifest)
      setConfirming(null)
      router.refresh()
    } catch {
      setError(["Couldn't reach the server."])
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Card className="border-caution-border bg-caution-surface p-4">
          <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-caution-strong">
            {error.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Card>
      )}

      {done && <RestoreDone manifest={done} />}

      <SnapshotButton inConsole onTaken={() => router.refresh()} />

      {snapshots.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-text-muted">
            No save states yet. Press <span className="font-semibold">Snapshot now</span>{" "}
            above to take the first one — after that they accrue on their own,
            before every import and every six hours.
          </p>
        </Card>
      ) : (
        <Card className="gap-0 p-0">
          <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border px-4 py-2 text-[10px] font-bold tracking-wider text-text-muted uppercase">
            <span>Taken</span>
            <span className="text-right">Wagers</span>
          </div>
          {snapshots.map((row) => (
            <SnapshotRowView
              key={row.id}
              row={row}
              live={live}
              open={confirming === row.id}
              busy={busy}
              onOpen={() => openConfirm(row.id)}
              onCancel={() => setConfirming(null)}
              onRestore={() => restore(row.id)}
            />
          ))}
        </Card>
      )}
    </div>
  )
}

function SnapshotRowView({
  row,
  live,
  open,
  busy,
  onOpen,
  onCancel,
  onRestore,
}: {
  row: SnapshotRow
  live: LiveCounts
  open: boolean
  busy: string | null
  onOpen: () => void
  onCancel: () => void
  onRestore: () => void
}) {
  // A payload missing a table was written by an older take_snapshot() and
  // would restore to a subtly older shape. restore_snapshot() refuses it; the
  // console says so up front rather than offering a button that always fails.
  const incomplete = SNAPSHOT_TABLES.some((t) => row[t] === null)

  return (
    <div className="border-t border-border px-4 py-3 first:border-t-0">
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className="text-sm font-semibold text-text-strong"
              title={formatTimestamp(row.created_at)}
            >
              {formatRelativeTime(row.created_at)}
            </span>
            <Badge variant={triggerTone(row.trigger)} uppercase>
              {row.trigger}
            </Badge>
          </div>
          <div className="mt-0.5 text-xs text-text-muted tabular">
            {formatTimestamp(row.created_at)}
          </div>
        </div>
        {/* Pat asked for the bet-placement count by name, so it carries the
            visual weight and everything else is quieter. */}
        <div className="text-right text-lg font-semibold text-text-strong tabular">
          {row.bet_placements ?? "—"}
        </div>
      </div>

      <div className="mt-1 text-xs text-text-muted tabular">
        {row.bets ?? "—"} bets · {row.bet_picks ?? "—"} picks ·{" "}
        {row.tournament_participants ?? "—"} participants ·{" "}
        {formatBytes(row.bytes)}
      </div>

      <div className="mt-2.5">
        {incomplete ? (
          <p className="text-xs font-medium text-caution-strong">
            Written by an older version of the app — it can&rsquo;t be restored
            safely, so there&rsquo;s no button.
          </p>
        ) : open ? (
          <ConfirmPanel
            row={row}
            live={live}
            busy={busy === row.id}
            disabled={busy !== null}
            onCancel={onCancel}
            onRestore={onRestore}
          />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className={TOUCH}
            disabled={busy !== null}
            onClick={onOpen}
          >
            Restore this
          </Button>
        )}
      </div>
    </div>
  )
}

function ConfirmPanel({
  row,
  live,
  busy,
  disabled,
  onCancel,
  onRestore,
}: {
  row: SnapshotRow
  live: LiveCounts
  busy: boolean
  disabled: boolean
  onCancel: () => void
  onRestore: () => void
}) {
  const [typed, setTyped] = useState("")
  const armed = typed.trim().toUpperCase() === CONFIRM_WORD

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-loss-border bg-loss-surface p-3">
      <div>
        <div className="text-sm font-semibold text-loss-strong">
          Replace everything with this save state?
        </div>
        <p className="mt-1 text-xs text-loss-strong">
          It was taken {formatRelativeTime(row.created_at)}. The five tables
          below go back to exactly how they were then.
        </p>
      </div>

      {/* The same numbers, in the same words, scripts/restore-snapshot.ts
          prints before it touches anything — "how much am I about to throw
          away" is the only question that matters here. */}
      <div className="rounded-md border border-loss-border bg-surface-card p-2.5">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] font-bold tracking-wider text-text-muted uppercase">
          <span />
          <span className="text-right">Now</span>
          <span className="text-right">After</span>
        </div>
        {SNAPSHOT_TABLES.map((table) => {
          const saved = row[table] ?? 0
          const note = describeDelta(live[table], saved)
          return (
            <div
              key={table}
              className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-t border-border pt-1.5 pb-0.5 text-xs first:border-t-0"
            >
              <span className="text-text-body">
                {TABLE_LABELS[table]}
                {note && (
                  <span className="ml-1.5 font-medium text-loss-strong">{note}</span>
                )}
              </span>
              <span className="text-right text-text-muted tabular">{live[table]}</span>
              <span className="text-right font-semibold text-text-strong tabular">
                {saved}
              </span>
            </div>
          )
        })}
      </div>

      <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-loss-strong">
        <li>
          <span className="font-semibold">
            Every wager placed since then is gone.
          </span>{" "}
          On a Friday afternoon that is real money somebody typed in, and
          nothing on any page will look wrong afterwards.
        </li>
        <li>
          <span className="font-semibold">The tournament row comes back too</span>{" "}
          — so this rewinds the phase clock and the deadlines with it, and if the
          leaderboard is already posted it takes it down, and everyone&rsquo;s
          dashboard goes back to the betting console.
        </li>
        <li>
          A <span className="font-semibold">pre-restore</span>{" "}
          save state is taken first, so this is undoable. Accounts, invites and avatars aren&rsquo;t
          touched.
        </li>
      </ul>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={`confirm-${row.id}`}
          className="text-xs font-semibold text-loss-strong"
        >
          Type {CONFIRM_WORD} to confirm
        </label>
        <Input
          id={`confirm-${row.id}`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={CONFIRM_WORD}
          className="tabular"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="destructive"
          className={TOUCH}
          disabled={!armed || disabled}
          onClick={onRestore}
        >
          {busy ? "Restoring…" : "Replace everything"}
        </Button>
        {/* The cancel restates the safe outcome, never "Cancel" — the house
            rule from people-console's "Keep access". */}
        <Button
          size="sm"
          variant="ghost"
          className={TOUCH}
          disabled={disabled}
          onClick={onCancel}
        >
          Keep current state
        </Button>
      </div>
    </div>
  )
}

function RestoreDone({ manifest }: { manifest: RestoreManifest }) {
  return (
    <Card className="border-win-border bg-win-surface p-4">
      <div className="text-sm font-semibold text-win-strong">
        ✓ Restored to the save state from {formatTimestamp(manifest.taken_at)}
      </div>
      {/* The manifest, the same discipline db-export.sh's carries: the
          operation reports numbers that prove it did what it said. A restore
          that silently restored nothing is exactly as dangerous as an export
          that silently captured nothing. */}
      <div className="mt-2 flex flex-col gap-0.5 text-xs text-text-body tabular">
        {SNAPSHOT_TABLES.map((table) => (
          <div key={table} className="flex justify-between gap-3">
            <span>{TABLE_LABELS[table]}</span>
            <span className="font-semibold">{manifest.counts[table]}</span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-text-body">
        A save state of what was here a moment ago was taken first —{" "}
        <span className="font-semibold">if this was a mistake, restore that one.</span>{" "}
        It&rsquo;s the newest <span className="font-semibold">pre-restore</span>{" "}
        row in the list below:
      </p>
      <p className="mt-1 text-xs break-all text-text-muted">
        <code className="tabular">{manifest.pre_restore_snapshot}</code>
      </p>
    </Card>
  )
}

/** Payload size, for the one question it answers: is this save state the size
 *  of a tournament, or the size of an empty database? */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
