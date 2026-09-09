"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ChaseList } from "@/lib/chase"

// The client half of /admin/close (Sprint 25 / #108) — the two moments of the
// weekend that used to need a SQL editor.
//
// Both controls write through /api/admin/close, which re-checks everything
// server-side; nothing here decides anything. The post button in particular
// only *reports* the server's refusal — the guard is finalizeReadiness() in
// lib/payouts.ts, not this component.
//
// Sprint 28 renamed the final control: it used to "publish final results",
// which meant revealing /results. It now posts the leaderboard, which swaps
// every member's dashboard, and it has a way back.

// Every button on this page is pressed standing on a golf course, in the dark,
// on the two evenings the tournament's money depends on. `size="sm"` draws a
// 36px control, which is right for the dense desktop admin it's used in
// everywhere else and wrong here — so these call sites, and only these, take a
// 44px height back on a phone.
const TOUCH = "h-11 sm:h-9"

// <input type="datetime-local"> speaks naive local time; the deadline is a
// tee time in Missouri. Convert through the tournament's own zone in both
// directions so an admin in another timezone doesn't quietly shift the close.
const TZ = "America/Chicago"

function toLocalInput(iso: string | null): string {
  if (!iso) return ""
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`
}

/** The tournament zone's UTC offset in minutes at a given instant. */
function offsetMinutes(at: Date): number {
  const asUtc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }))
  const asTz = new Date(at.toLocaleString("en-US", { timeZone: TZ }))
  return (asUtc.getTime() - asTz.getTime()) / 60000
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  // Interpret the wall-clock reading as Central, then correct for the offset
  // in force at that moment (iterating once settles the DST edge).
  let guess = new Date(`${value}:00Z`)
  for (let i = 0; i < 2; i++) {
    guess = new Date(new Date(`${value}:00Z`).getTime() + offsetMinutes(guess) * 60000)
  }
  return Number.isNaN(guess.getTime()) ? null : guess.toISOString()
}

export type CloseConsoleProps = {
  chase: ChaseList
  clock: {
    phase1_closes_at: string | null
    phase2_closes_at: string | null
    show_countdown: boolean
  }
  /** Already 'completed' — the unlock has happened. */
  finalized: boolean
  /** Server-side count, so the button can explain itself before being pressed. */
  pendingPicks: number
  unclosedBets: number
}

export function CloseConsole({
  chase,
  clock,
  finalized,
  pendingPicks,
  unclosedBets,
}: CloseConsoleProps) {
  const router = useRouter()
  const [p1, setP1] = useState(toLocalInput(clock.phase1_closes_at))
  const [p2, setP2] = useState(toLocalInput(clock.phase2_closes_at))
  const [countdown, setCountdown] = useState(clock.show_countdown)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)

  async function send(
    body: Record<string, unknown>,
    method: "PATCH" | "POST",
    tag: string
  ) {
    setBusy(tag)
    setError(null)
    try {
      const res = await fetch("/api/admin/close", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.errors ?? [data.error ?? "Something went wrong."])
        return
      }
      router.refresh()
    } catch {
      setError(["Couldn't reach the server."])
    } finally {
      setBusy(null)
    }
  }

  const notReady = pendingPicks > 0 || unclosedBets > 0

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

      {/* ── The chase list ────────────────────────────────────────────── */}
      <Card className="gap-0 p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Badge variant={chase.chase.length > 0 ? "amber" : "green"}>
              {chase.chase.length}
            </Badge>
            <span className="font-heading text-lg text-text-strong">
              To chase before Phase {chase.closing_phase} closes
            </span>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {chase.closing_phase === 1
              ? "Being short of your entry fee is normal right now, so it isn't a reason to text anyone yet."
              : "Last chance for both the pick minimum and the exact total."}
          </p>
        </div>

        {/* The line an admin reads off a phone, verbatim and copyable. */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm leading-normal text-text-body">{chase.line}</p>
          <Button
            variant="secondary"
            size="sm"
            className={TOUCH}
            onClick={() => {
              void navigator.clipboard?.writeText(chase.line)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-border px-4 py-2 text-[10px] font-bold tracking-wider text-text-muted uppercase">
          <span>Player</span>
          <span className="text-right">Picks</span>
          <span className="text-right">Wagered</span>
        </div>
        {chase.people.map((p) => (
          <div
            key={p.user_id}
            className={
              "grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-t border-border px-4 py-2.5 text-sm first:border-t-0" +
              (p.needs_a_text ? " bg-caution-surface" : "")
            }
          >
            <span className="min-w-0">
              <span className="font-semibold text-text-strong">
                {p.display_name}
              </span>
              {p.reason && (
                <span className="ml-2 text-xs text-caution-strong">{p.reason}</span>
              )}
            </span>
            <span className="tabular text-right text-text-body">
              {p.phase1_picks} + {p.phase2_picks}
            </span>
            <span className="tabular text-right text-text-body">
              ${p.total_wagered} / ${p.entry_fee}
            </span>
          </div>
        ))}
      </Card>

      {/* ── The phase clock ───────────────────────────────────────────── */}
      <Card className="flex flex-col gap-3 p-4">
        <div>
          <div className="font-heading text-lg text-text-strong">Phase clock</div>
          <p className="mt-0.5 text-xs text-text-muted">
            Times are Central, the same clock as the tee sheet. Closing a phase
            stops new wagers immediately; it does not close the bets or reveal
            anyone&apos;s picks — that still happens when you upload the sheet.
          </p>
        </div>

        {([1, 2] as const).map((phase) => (
          <div key={phase} className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-[200px] flex-col gap-1">
              <Label htmlFor={`p${phase}`}>Phase {phase} closes</Label>
              <Input
                id={`p${phase}`}
                type="datetime-local"
                value={phase === 1 ? p1 : p2}
                onChange={(e) =>
                  phase === 1 ? setP1(e.target.value) : setP2(e.target.value)
                }
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              className={TOUCH}
              disabled={busy !== null}
              onClick={() =>
                send(
                  {
                    [`phase${phase}_closes_at`]: fromLocalInput(
                      phase === 1 ? p1 : p2
                    ),
                  },
                  "PATCH",
                  `save-${phase}`
                )
              }
            >
              {busy === `save-${phase}` ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={TOUCH}
              disabled={busy !== null}
              onClick={() =>
                send(
                  { [`phase${phase}_closes_at`]: new Date().toISOString() },
                  "PATCH",
                  `now-${phase}`
                )
              }
            >
              {busy === `now-${phase}` ? "Closing…" : "Close now"}
            </Button>
          </div>
        ))}

        <label className="flex min-h-11 items-center gap-2.5 text-sm text-text-body">
          <input
            type="checkbox"
            className="size-5 shrink-0"
            checked={countdown}
            disabled={busy !== null}
            onChange={(e) => {
              setCountdown(e.target.checked)
              void send({ show_countdown: e.target.checked }, "PATCH", "countdown")
            }}
          />
          Show members the countdown to the next deadline
        </label>
      </Card>

      {/* ── Posting the leaderboard ───────────────────────────────────── */}
      <Card className="flex flex-col gap-3 p-4">
        <div>
          <div className="font-heading text-lg text-text-strong">
            Post the leaderboard
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Saturday night, once every result is uploaded. This turns every
            member&rsquo;s dashboard into the final standings — the betting
            console, the countdown and the house rules all go.
          </p>
        </div>

        {finalized ? (
          <Unpost
            busy={busy === "unfinalize"}
            disabled={busy !== null}
            onUnpost={() => send({ action: "unfinalize" }, "POST", "unfinalize")}
          />
        ) : notReady ? (
          <div className="rounded-lg border border-caution-border bg-caution-surface p-3 text-sm text-caution-strong">
            <p className="font-semibold">Not ready yet.</p>
            <ul className="mt-1 list-disc pl-4">
              {pendingPicks > 0 && (
                <li>
                  {pendingPicks} pick{pendingPicks === 1 ? "" : "s"} with no
                  result. Posting now would split the pool across only the
                  settled wagers — every payout would come out too high, and
                  nothing on the page would look wrong.
                </li>
              )}
              {unclosedBets > 0 && (
                <li>
                  {unclosedBets} bet{unclosedBets === 1 ? " is" : "s are"} still
                  open or hidden.
                </li>
              )}
            </ul>
          </div>
        ) : (
          <Button
            variant="gold"
            size="sm"
            className={TOUCH}
            disabled={busy !== null}
            onClick={() => send({ action: "finalize" }, "POST", "finalize")}
          >
            {busy === "finalize" ? "Posting…" : "Post the leaderboard"}
          </Button>
        )}
      </Card>
    </div>
  )
}

/**
 * Taking the leaderboard back down.
 *
 * This is what makes the post on the import report safe to tap: without a way
 * back, a premature post is undoable only through a snapshot restore or the
 * database itself.
 *
 * TWO TAPS, NOT A TYPED WORD. /admin/snapshots asks an admin to type RESTORE
 * because a restore destroys wagers irreversibly. Nothing is destroyed here —
 * only tournaments.status moves, re-posting puts the identical standings back,
 * and the numbers are recomputed from the same rows either way. Spending the
 * typed-word ceremony on a reversible action is how it stops meaning anything
 * on the one screen where it does.
 *
 * Inline rather than a modal, like every other confirm in this app
 * (people-console's Revoke, bet-placement-card's Remove).
 */
function Unpost({
  busy,
  disabled,
  onUnpost,
}: {
  busy: boolean
  disabled: boolean
  onUnpost: () => void
}) {
  const [arming, setArming] = useState(false)

  if (!arming) {
    return (
      <div className="flex flex-col gap-2.5">
        <p className="text-sm text-text-body">
          <span className="font-semibold">The leaderboard is up.</span> Every
          member&rsquo;s dashboard is the final standings.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className={`${TOUCH} self-start`}
          disabled={disabled}
          onClick={() => setArming(true)}
        >
          Take it back down
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-caution-border bg-caution-surface p-3">
      <div>
        <div className="text-sm font-semibold text-caution-strong">
          Take the leaderboard down?
        </div>
        <p className="mt-1 text-xs text-caution-strong">
          Everyone reading their payout right now loses it — their dashboard
          goes back to the betting console mid-sentence. Nothing is deleted:
          every wager, result and entry fee stays exactly as it is, and posting
          again brings back the same numbers.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="destructive"
          className={TOUCH}
          disabled={disabled}
          onClick={onUnpost}
        >
          {busy ? "Taking it down…" : "Take it down"}
        </Button>
        {/* The cancel restates the safe outcome, never "Cancel" — the house
            rule from people-console's "Keep access". */}
        <Button
          size="sm"
          variant="ghost"
          className={TOUCH}
          disabled={disabled}
          onClick={() => setArming(false)}
        >
          Leave it posted
        </Button>
      </div>
    </div>
  )
}
