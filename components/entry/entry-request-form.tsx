"use client"

import { useState } from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  legalSplits,
  snapSplit,
  totalBounds,
  VENMO_MEMO,
  VENMO_URL,
  type RequestWindow,
} from "@/lib/entry-request"
import type { TournamentRules } from "@/lib/validation"

// The one-time entry request (Sprint 30 / PRD §12 A26). A total, a slider
// that splits it between the phases — snapping to the splits the per-phase
// bounds allow — the "I'm playing" checkbox, a two-tap confirm that says out
// loud this can't be changed, and then the Venmo hand-off with the memo.
//
// Everything the slider snaps to comes from lib/entry-request.ts, which is
// also what the API validates with, so the form can never offer a split the
// server refuses. The "one time" promise itself is the database's (UNIQUE +
// no member UPDATE) — the copy here just makes sure nobody is surprised by it.

export type EntryRequestFormProps = {
  rules: TournamentRules
  window: RequestWindow
  /** Prefill for the playing checkbox — an admin may already have set it. */
  defaultIsPlayer?: boolean
  /** After the Venmo hand-off: a callback (onboarding hard-navigates) or a
   * link (the /entry page). */
  onDone?: () => void
  doneHref?: string
  doneLabel?: string
  /** "Do this later" — shown only when given (the onboarding step). */
  onSkip?: () => void
}

type Stage = "edit" | "confirm" | "done"

function splitLabel(p1: number, p2: number): string {
  if (p1 > 0 && p2 > 0) return `Phase 1 $${p1} · Phase 2 $${p2}`
  if (p1 > 0) return `all of it in Phase 1`
  return `all of it in Phase 2`
}

export function EntryRequestForm({
  rules,
  window,
  defaultIsPlayer = true,
  onDone,
  doneHref,
  doneLabel = "Go to the bet menu",
  onSkip,
}: EntryRequestFormProps) {
  const bounds = totalBounds(rules, window)
  const bothOpen = window.phases.length === 2
  // Default: the minimum in every phase still open — $20 + $20, or $20 in
  // Phase 2 alone — so the form opens on a legal, obvious ask.
  const [totalRaw, setTotalRaw] = useState(String(rules.entry_fee_min * window.phases.length))
  const [phase1Raw, setPhase1Raw] = useState(bothOpen ? rules.entry_fee_min : 0)
  const [isPlayer, setIsPlayer] = useState(defaultIsPlayer)
  const [stage, setStage] = useState<Stage>("edit")
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const total = totalRaw.trim() === "" ? NaN : Number(totalRaw)
  const legal = Number.isInteger(total) ? legalSplits(total, rules, window) : []
  const valid = legal.length > 0
  // The slider moves freely; what it MEANS is the nearest legal split. The
  // preview and the request use the snapped numbers, never the raw thumb.
  const p1 = valid ? snapSplit(total, phase1Raw, rules, window) : 0
  const p2 = valid ? total - p1 : 0
  const sliderMax = valid ? total : 0
  const sliderValue = Math.min(Math.max(phase1Raw, 0), sliderMax)
  const canSplit = bothOpen && legal.length > 2
  const oneOrTheOther = bothOpen && valid && legal.length === 2

  const totalHint = bothOpen
    ? `$${bounds.min} to $${bounds.max}, whole dollars — $${rules.entry_fee_min} to $${rules.entry_fee_max} per phase.`
    : `$${bounds.min} to $${bounds.max}, whole dollars. Phase 1 has closed, so this all goes to Phase 2.`

  async function submit() {
    setBusy(true)
    setErrors([])
    try {
      const res = await fetch("/api/entry-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase1: p1, phase2: p2, isPlayer }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setErrors(
          Array.isArray(json?.errors)
            ? json.errors
            : [json?.error ?? `Couldn't save your request (${res.status}).`]
        )
        setStage("edit")
        return
      }
      setStage("done")
    } catch {
      setErrors(["Save failed — check your connection and try again."])
      setStage("edit")
    } finally {
      setBusy(false)
    }
  }

  if (stage === "done") {
    return (
      <Card accent elevated data-testid="entry-done">
        <CardContent className="flex flex-col gap-5">
          <div>
            <div className="font-heading text-2xl text-text-strong">
              Now pay ${total} on Venmo
            </div>
            <p className="mt-1 text-sm leading-normal text-text-muted">
              Put <strong className="text-text-strong">{VENMO_MEMO}</strong> in
              the memo — that&apos;s how the admins match it to you. An admin
              approves your entry once it lands.
            </p>
          </div>
          <Button
            variant="gold"
            size="lg"
            className="w-full"
            data-testid="entry-venmo"
            render={<a href={VENMO_URL} target="_blank" rel="noopener noreferrer" />}
          >
            Open Venmo <ExternalLink className="size-4" aria-hidden />
          </Button>
          <p className="text-sm text-text-body">
            Your request: <span className="font-semibold">{splitLabel(p1, p2)}</span>
            {isPlayer ? "" : " · not playing"}. It&apos;s recorded once, so if
            something&apos;s wrong, tell an admin rather than trying again.
          </p>
          {onDone ? (
            <Button size="lg" className="w-full" onClick={onDone}>
              {doneLabel}
            </Button>
          ) : doneHref ? (
            <Button size="lg" className="w-full" render={<Link href={doneHref} />}>
              {doneLabel}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  if (stage === "confirm") {
    return (
      <Card accent elevated data-testid="entry-confirm">
        <CardContent className="flex flex-col gap-5">
          <div>
            <div className="font-heading text-2xl text-text-strong">
              Request ${total} — {splitLabel(p1, p2)}?
            </div>
            <p className="mt-1 text-sm leading-normal text-caution-strong">
              This is your one chance: you can&apos;t add to it or change it
              later in the app.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStage("edit")} disabled={busy}>
              Back
            </Button>
            <Button
              variant="gold"
              onClick={submit}
              disabled={busy}
              data-testid="entry-confirm-button"
            >
              {busy ? "Sending…" : "Confirm"}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card accent elevated data-testid="entry-form">
      <CardContent className="flex flex-col gap-5">
        <div>
          <div className="font-heading text-2xl text-text-strong">Put your money in</div>
          <p className="mt-1 text-sm leading-normal text-text-muted">
            Each phase is its own pot with its own entry. Ask for a total, then
            split it — or sit one phase out. You can only do this once.
          </p>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            setErrors([])
            setStage("confirm")
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-total">Total</Label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-text-muted">$</span>
              <Input
                id="entry-total"
                data-testid="entry-total"
                type="number"
                inputMode="numeric"
                min={bounds.min}
                max={bounds.max}
                step={1}
                value={totalRaw}
                onChange={(e) => setTotalRaw(e.target.value)}
                className="max-w-[8rem]"
                required
              />
            </div>
            <p className="text-xs text-text-muted">{totalHint}</p>
            {!valid && totalRaw.trim() !== "" && (
              <p className="text-xs text-loss-strong" role="alert">
                {bothOpen
                  ? `Totals run from $${bounds.min} to $${bounds.max}: up to $${rules.entry_fee_max} fits in one phase, and anything over needs $${rules.entry_fee_min} to $${rules.entry_fee_max} in each.`
                  : `Phase 2 takes $${rules.entry_fee_min} to $${rules.entry_fee_max}.`}
              </p>
            )}
          </div>

          {valid && bothOpen && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="entry-split">
                {canSplit ? "Split between the phases" : "Which phase"}
              </Label>
              <input
                id="entry-split"
                data-testid="entry-slider"
                type="range"
                min={0}
                max={sliderMax}
                step={1}
                value={sliderValue}
                onChange={(e) => setPhase1Raw(Number(e.target.value))}
                aria-valuetext={splitLabel(p1, p2)}
                className="w-full accent-[var(--color-primary)]"
              />
              <div className="flex justify-between text-xs text-text-muted">
                <span>All in Phase 2</span>
                <span>All in Phase 1</span>
              </div>
              {oneOrTheOther && (
                <p className="text-xs text-text-muted">
                  ${total} fits in one phase — slide to pick which. Splitting
                  takes at least ${rules.entry_fee_min * 2}.
                </p>
              )}
            </div>
          )}

          <div
            className="rounded-lg border border-border bg-surface-sunken px-4 py-3"
            data-testid="entry-preview"
          >
            <div className="font-heading text-lg text-text-strong">
              {valid ? splitLabel(p1, p2).replace(/^all of it in /, "All in ") : "—"}
            </div>
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-text-muted">
              {p1 > 0 && (
                <li>
                  Phase 1: wager the full ${p1} across {rules.min_picks_per_phase}+ picks.
                </li>
              )}
              {p2 > 0 && (
                <li>
                  Phase 2: wager the full ${p2} across {rules.min_picks_per_phase}+ picks.
                </li>
              )}
              <li>
                Max single bet ${rules.max_single_bet}. The first ${rules.entry_fee_min} of
                each entry stays in the pot whether or not you wager it.
              </li>
            </ul>
          </div>

          <label className="flex items-start gap-3 text-sm text-text-body">
            <input
              type="checkbox"
              data-testid="entry-playing"
              checked={isPlayer}
              onChange={(e) => setIsPlayer(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
            />
            <span>
              I&apos;m playing in the tournament
              <span className="block text-xs text-text-muted">
                Players can put at most a quarter of a phase&apos;s entry on
                themselves. Uncheck if you&apos;re only betting.
              </span>
            </span>
          </label>

          {errors.length > 0 && (
            <ul
              className="flex list-disc flex-col gap-1 rounded-lg border border-loss-border bg-loss-surface py-3 pr-3 pl-8 text-sm text-loss-strong"
              role="alert"
            >
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}

          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full"
            disabled={!valid || busy}
            data-testid="entry-submit"
          >
            Request ${valid ? total : "—"}
          </Button>
          {onSkip && (
            <Button type="button" variant="ghost" onClick={onSkip} data-testid="entry-skip">
              Do this later
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
