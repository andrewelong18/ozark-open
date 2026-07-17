"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { OddsChip } from "./odds-chip"
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
}

type RowState = {
  value: string
  placed: boolean
  error: string | null
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
}: BetPlacementCardProps) {
  const router = useRouter()

  const [rows, setRows] = React.useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      picks.map((pick) => {
        const amount = placements[pick.id]
        return [
          pick.id,
          {
            value: amount != null ? String(amount) : "",
            placed: amount != null,
            error: null,
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

  const place = async (pick: PlacementPick) => {
    const state = rows[pick.id]
    const amount = Number(state.value)
    if (!state.value || amount <= 0) return
    setBusy(pick.id)
    patchRow(pick.id, { error: null })
    try {
      const res = await fetch("/api/placements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pick_id: pick.id, amount }),
      })
      const data = (await res.json().catch(() => null)) as {
        errors?: string[]
        error?: string
        placement?: { amount: number }
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
      patchRow(pick.id, { placed: true, error: null })
      setLive((m) => ({ ...m, [pick.id]: amount }))
      router.refresh()
    } catch {
      patchRow(pick.id, { placed: false, error: "Couldn't reach the book — check your connection." })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (pick: PlacementPick) => {
    setBusy(pick.id)
    patchRow(pick.id, { error: null })
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
      patchRow(pick.id, { value: "", placed: false, error: null })
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
              "flex items-start justify-between gap-3 border-b border-border px-4 py-3 last:rounded-b-[inherit] last:border-b-0",
              hasPlacement ? "bg-indigo-50" : "bg-surface-card"
            )}
          >
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
                    patchRow(pick.id, { value: digits, placed: false, error: null })
                  }
                  onPlace={() => place(pick)}
                />
                {hasPlacement && (
                  <button
                    type="button"
                    onClick={() => remove(pick)}
                    disabled={busy === pick.id}
                    className="cursor-pointer text-[11px] font-medium text-text-muted transition-colors hover:text-loss"
                  >
                    ✕ Remove bet
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}
