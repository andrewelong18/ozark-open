"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { OddsChip } from "./odds-chip"
import { MoneyDisplay } from "./money-display"
import { StakeInput } from "./stake-input"

export type PlacementPick = {
  id: string
  label: string
  american_odds: number
  /** Sheet-supplied display strings — rendered verbatim, never recomputed. */
  fractional_odds: string
  probability: string
}

export type BetPlacementCardProps = {
  title: string
  /** Pre-formatted total probability line, or null to omit. */
  totalProbability: string | null
  /** From bet_categories: false for Match / Group Match — pick-one UI. */
  allowsMultiplePicks: boolean
  picks: PlacementPick[]
  /** The viewer's live placement amounts by pick id. */
  placements: Record<string, number>
  /** The odds_at_placement snapshot per placed pick — powers the locked-odds
   * receipt (Sprint 17 §1.5). Kept separate from live odds so the receipt
   * shows what was locked, never the pick's current menu odds. */
  lockedOdds?: Record<string, number>
}

/** The confirmed placement behind a row's receipt — the locked odds and stake
 * the API stored, shown back as a trust artifact. */
type Receipt = { odds: number; amount: number }

type RowState = {
  value: string
  placed: boolean
  error: string | null
  receipt: Receipt | null
  /** A two-step guard on the writes: placing and removing both stage a confirm
   * step first so a stray tap can't lock in or wipe a bet. null = no pending
   * action. */
  confirming: "place" | "remove" | null
}

/**
 * An open bet the viewer can wager on: BetRow anatomy from the design system
 * — label + odds cluster left, stake action zone right. Multi-pick categories
 * get a StakeInput per pick; Match / Group Match switch to a pick-one
 * affordance (radio + a single input on the chosen pick). All checks here are
 * UX — the API re-validates and its messages render verbatim under the input.
 */
export function BetPlacementCard({
  title,
  totalProbability,
  allowsMultiplePicks,
  picks,
  placements,
  lockedOdds = {},
}: BetPlacementCardProps) {
  const router = useRouter()

  const [rows, setRows] = React.useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      picks.map((pick) => {
        const amount = placements[pick.id]
        const odds = lockedOdds[pick.id]
        return [
          pick.id,
          {
            value: amount != null ? String(amount) : "",
            placed: amount != null,
            error: null,
            receipt:
              amount != null && odds != null ? { odds, amount } : null,
            confirming: null,
          },
        ]
      })
    )
  )
  // Live placements as known client-side (kept in sync after each write).
  const [live, setLive] = React.useState(placements)
  const placedPickId = Object.keys(live)[0] ?? null
  const [selected, setSelected] = React.useState<string | null>(placedPickId)
  const [busy, setBusy] = React.useState<string | null>(null)

  const patchRow = (pickId: string, patch: Partial<RowState>) =>
    setRows((r) => ({ ...r, [pickId]: { ...r[pickId], ...patch } }))

  // Step 1 of placing: validate the amount is real, then stage the confirm
  // strip instead of writing. The actual POST waits for place() below.
  const requestPlace = (pick: PlacementPick) => {
    const state = rows[pick.id]
    if (!state.value || Number(state.value) <= 0) return
    patchRow(pick.id, { error: null, confirming: "place" })
  }

  const place = async (pick: PlacementPick) => {
    const state = rows[pick.id]
    const amount = Number(state.value)
    if (!state.value || amount <= 0) return
    setBusy(pick.id)
    patchRow(pick.id, { error: null, confirming: null })
    try {
      const res = await fetch("/api/placements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pick_id: pick.id, amount }),
      })
      const data = (await res.json().catch(() => null)) as {
        errors?: string[]
        error?: string
        placement?: { amount: number; odds_at_placement: number }
      } | null
      if (!res.ok) {
        // Rule violations arrive as lib/validation.ts strings — shown as-is.
        const message =
          data?.errors?.join(" ") ??
          data?.error ??
          "Something went wrong — try again."
        patchRow(pick.id, { placed: false, error: message })
        return
      }
      // Receipt from the write's own return row: the snapshotted odds and
      // stake, so the confirmation shows exactly what was locked (§1.5).
      const placement = data?.placement
      patchRow(pick.id, {
        placed: true,
        error: null,
        receipt: {
          odds: placement ? Number(placement.odds_at_placement) : pick.american_odds,
          amount: placement ? Number(placement.amount) : amount,
        },
      })
      setLive((m) => ({ ...m, [pick.id]: amount }))
      router.refresh()
    } catch {
      patchRow(pick.id, { placed: false, error: "Couldn't reach the book — check your connection." })
    } finally {
      setBusy(null)
    }
  }

  // Step 1 of removing: staging the confirm strip. Removal is destructive
  // (soft-delete of the wager), so it never fires on a single tap.
  const requestRemove = (pick: PlacementPick) => {
    patchRow(pick.id, { error: null, confirming: "remove" })
  }

  const remove = async (pick: PlacementPick) => {
    setBusy(pick.id)
    patchRow(pick.id, { error: null, confirming: null })
    try {
      const res = await fetch("/api/placements", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pick_id: pick.id }),
      })
      const data = (await res.json().catch(() => null)) as {
        errors?: string[]
        error?: string
      } | null
      if (!res.ok) {
        const message =
          data?.errors?.join(" ") ??
          data?.error ??
          "Something went wrong — try again."
        patchRow(pick.id, { error: message })
        return
      }
      patchRow(pick.id, { value: "", placed: false, error: null, receipt: null })
      setLive((m) => {
        const next = { ...m }
        delete next[pick.id]
        return next
      })
      router.refresh()
    } catch {
      patchRow(pick.id, { error: "Couldn't reach the book — check your connection." })
    } finally {
      setBusy(null)
    }
  }

  // Pick-one affordance: selecting is free until a placement exists; after
  // that the placed pick holds the selection until it's removed.
  const select = (pick: PlacementPick) => {
    if (allowsMultiplePicks) return
    if (placedPickId && placedPickId !== pick.id) {
      const placedLabel = picks.find((p) => p.id === placedPickId)?.label ?? "your pick"
      patchRow(pick.id, {
        error: `Remove your $${live[placedPickId]} on ${placedLabel} to switch picks.`,
      })
      return
    }
    setSelected(pick.id)
  }

  return (
    <Card className="gap-0 p-0">
      <div
        className="flex items-start justify-between gap-3 border-b border-border px-4 py-3"
        role={allowsMultiplePicks ? undefined : "radiogroup"}
        aria-label={allowsMultiplePicks ? undefined : `${title} — pick one`}
      >
        <div className="min-w-0 flex-1">
          <div className="text-base leading-snug font-semibold text-pretty text-text-strong">
            {title}
          </div>
          {totalProbability && (
            <div className="tabular mt-0.5 text-[11px] text-text-muted">
              {totalProbability}
            </div>
          )}
          {!allowsMultiplePicks && (
            <div className="mt-0.5 text-[11px] text-text-muted">
              Pick one
            </div>
          )}
        </div>
      </div>

      {picks.map((pick) => {
        const state = rows[pick.id]
        const hasPlacement = live[pick.id] != null
        const showInput = allowsMultiplePicks || selected === pick.id

        return (
          <div
            key={pick.id}
            className={cn(
              "border-b border-border px-4 py-3 last:rounded-b-[inherit] last:border-b-0",
              hasPlacement ? "bg-indigo-50" : "bg-surface-card"
            )}
          >
            <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-start gap-2.5">
                {!allowsMultiplePicks && (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected === pick.id}
                    aria-label={`Pick ${pick.label}`}
                    onClick={() => select(pick)}
                    className={cn(
                      "mt-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-colors",
                      selected === pick.id
                        ? "border-indigo-700"
                        : "border-border-strong"
                    )}
                  >
                    {selected === pick.id && (
                      <span className="size-2.5 rounded-full bg-indigo-700" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => select(pick)}
                  className={cn(
                    "min-w-0 text-left text-base leading-snug font-medium text-pretty text-text-strong",
                    !allowsMultiplePicks && "cursor-pointer"
                  )}
                  tabIndex={allowsMultiplePicks ? -1 : undefined}
                >
                  {pick.label}
                </button>
              </div>
              <div className={cn(!allowsMultiplePicks && "pl-[30px]")}>
                <OddsChip
                  odds={pick.american_odds}
                  size="sm"
                  fractional={pick.fractional_odds}
                  probability={pick.probability}
                />
              </div>
              {/* Hint/error for rows without their own input (pick-one) */}
              {!showInput && state.error && (
                <span className={cn("text-[11px] font-medium text-loss", !allowsMultiplePicks && "pl-[30px]")}>
                  {state.error}
                </span>
              )}
            </div>

            {showInput && (
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StakeInput
                  value={state.value}
                  placed={state.placed}
                  error={state.error}
                  disabled={busy === pick.id}
                  onChange={(digits) =>
                    patchRow(pick.id, {
                      value: digits,
                      placed: false,
                      error: null,
                      confirming: null,
                    })
                  }
                  onPlace={() => requestPlace(pick)}
                />
                {hasPlacement && state.confirming !== "remove" && (
                  <button
                    type="button"
                    onClick={() => requestRemove(pick)}
                    disabled={busy === pick.id}
                    className="cursor-pointer text-[11px] font-medium text-loss transition-colors hover:text-loss-strong"
                  >
                    ✕ Remove bet
                  </button>
                )}
              </div>
            )}
            </div>

            {/* Explicit place-confirm: locking in a wager takes a second,
                deliberate tap — never a stray Enter. */}
            {state.confirming === "place" && (
              <div
                className={cn(
                  "mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2.5",
                  !allowsMultiplePicks && "ml-[30px]"
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-strong">
                  <span className="font-semibold">
                    {hasPlacement ? "Update to" : "Lock in"}
                  </span>
                  <MoneyDisplay value={Number(state.value)} size="sm" weight="bold" />
                  <span className="text-text-muted">on</span>
                  <span className="font-semibold">{pick.label}</span>
                  <OddsChip odds={pick.american_odds} size="sm" />
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => place(pick)}
                    disabled={busy === pick.id}
                  >
                    {hasPlacement ? "Confirm change" : "Confirm bet"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => patchRow(pick.id, { confirming: null })}
                    disabled={busy === pick.id}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Explicit remove-confirm: removal is destructive (soft-deletes
                the wager), so it takes a deliberate second tap. */}
            {state.confirming === "remove" && (
              <div
                className={cn(
                  "mt-2 rounded-lg border border-loss-border bg-loss-surface px-3 py-2.5",
                  !allowsMultiplePicks && "ml-[30px]"
                )}
              >
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-text-strong">
                  <span className="font-semibold">Remove your</span>
                  {state.receipt && (
                    <MoneyDisplay
                      value={state.receipt.amount}
                      size="sm"
                      weight="bold"
                    />
                  )}
                  <span className="text-text-muted">on</span>
                  <span className="font-semibold">{pick.label}</span>
                  <span className="text-text-muted">?</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => remove(pick)}
                    disabled={busy === pick.id}
                  >
                    Remove bet
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => patchRow(pick.id, { confirming: null })}
                    disabled={busy === pick.id}
                  >
                    Keep it
                  </Button>
                </div>
              </div>
            )}

            {/* Locked-odds receipt (§1.5): the snapshotted odds + stake behind
                this placement — the confirmation that odds lock at write.
                Hidden while a confirm strip owns the row. */}
            {hasPlacement && state.receipt && state.confirming === null && (
              <div
                className={cn(
                  "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs",
                  !allowsMultiplePicks && "pl-[30px]"
                )}
              >
                <span className="font-semibold text-win-strong">✓ Locked in</span>
                <OddsChip odds={state.receipt.odds} size="sm" />
                <MoneyDisplay value={state.receipt.amount} size="xs" weight="bold" />
                <span className="text-text-muted">· odds locked at placement</span>
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}
