"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  placedPickIdIn,
  placementTarget,
  scopePlacements,
  stakeEntryError,
  type OnBehalfOf,
} from "@/lib/placements"
import { cn } from "@/lib/utils"
import { PickLabel } from "./pick-label"
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
  /** The golfer this pick names (FK → users.id); when set, the label links to
   * their profile modal. Null for Field / Yes-No / unmatched — plain text. */
  player_user_id: string | null
  /** That golfer's avatar for the trailing icon + modal fallback. */
  player_avatar_url: string | null
}

export type BetPlacementCardProps = {
  title: string
  /** Pre-formatted total probability line, or null to omit. */
  totalProbability: string | null
  /** From bet_categories: false for Match / Group Match — pick-one UI. */
  allowsMultiplePicks: boolean
  picks: PlacementPick[]
  /** The viewer's live placement amounts by pick id — TOURNAMENT-WIDE as the
   * menu passes it, covering every bet. Scoped to this card's own picks on
   * arrival (#161); never read raw, or the card adopts another bet's wager. */
  placements: Record<string, number>
  /** The odds_at_placement snapshot per placed pick — powers the locked-odds
   * receipt (Sprint 17 §1.5). Kept separate from live odds so the receipt
   * shows what was locked, never the pick's current menu odds. */
  lockedOdds?: Record<string, number>
  /** Surfaces a rule-violation message as the menu's floating toast instead of
   * inline, so the stake input never reflows. The row still flags its own
   * `error` state to turn the input border red. */
  onError?: (message: string) => void
  /**
   * The member an admin is entering wagers for (Sprint 23 / #101), or null
   * when the viewer is betting for themselves. Switches the writes to the
   * on-behalf endpoint and names the bettor in the body. The §7 rules are
   * evaluated against the member either way — the server owns that, not this.
   *
   * REQUIRED, with no default, on purpose. A refactor that drops the prop on
   * the way through BetsMenu would make an admin's wager for a member post as
   * THEMSELVES — valid, validated, recorded against the wrong person, and
   * invisible from both ends. Required means that refactor fails to compile.
   */
  onBehalfOf: OnBehalfOf
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
 * — label + odds cluster left, stake action zone right. Every pick gets its own
 * StakeInput, in every category.
 *
 * Match / Group Match take one pick only (§7 rule 7). That used to be a radio
 * you tapped before the stake box appeared; Pat asked for the step to go
 * (#162), so the pick-one rule is expressed by DISABLING the other rows once a
 * wager exists instead. A second pick is still impossible — you just find that
 * out by looking rather than by being refused after typing.
 *
 * All checks here are UX. validateSinglePickCategory is the enforcement, and
 * the API's messages render verbatim in the menu's toast.
 */
export function BetPlacementCard({
  title,
  totalProbability,
  allowsMultiplePicks,
  picks,
  placements,
  lockedOdds = {},
  onError,
  onBehalfOf,
}: BetPlacementCardProps) {
  const router = useRouter()

  // One target covers place, edit and remove. Resolved in lib/placements.ts so
  // the swap is unit-tested rather than trusted to two ternaries.
  const { endpoint, bettorField } = placementTarget(onBehalfOf)

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
  const pickIds = picks.map((pick) => pick.id)
  // Live placements as known client-side (kept in sync after each write), and
  // scoped to THIS bet on the way in. Reading the menu's tournament-wide map
  // straight was #161: the first key of that map belongs to whatever bet the
  // bettor happened to wager on first, so a card would treat another bet's
  // pick as its own placed one — refusing every pick it owned, and hiding the
  // remove control on the wager it thought was there.
  const [live, setLive] = React.useState(() =>
    scopePlacements(pickIds, placements)
  )
  const placedPickId = placedPickIdIn(pickIds, live)
  const [busy, setBusy] = React.useState<string | null>(null)

  const patchRow = (pickId: string, patch: Partial<RowState>) =>
    setRows((r) => ({ ...r, [pickId]: { ...r[pickId], ...patch } }))

  /** Report a bad stake the same way a server rejection is reported: red
   * border on the row, message in the toast (#92 — this used to be silent). */
  const rejectStake = (pickId: string, message: string) => {
    patchRow(pickId, { error: message, confirming: null })
    onError?.(message)
  }

  // Step 1 of placing: validate the amount is real, then stage the confirm
  // strip instead of writing. The actual POST waits for place() below.
  const requestPlace = (pick: PlacementPick) => {
    const state = rows[pick.id]
    const entryError = stakeEntryError(state.value)
    if (entryError) return rejectStake(pick.id, entryError)
    patchRow(pick.id, { error: null, confirming: "place" })
  }

  const place = async (pick: PlacementPick) => {
    const state = rows[pick.id]
    const amount = Number(state.value)
    const entryError = stakeEntryError(state.value)
    if (entryError) return rejectStake(pick.id, entryError)
    setBusy(pick.id)
    patchRow(pick.id, { error: null, confirming: null })
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bettorField, pick_id: pick.id, amount }),
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
        onError?.(message)
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
      const message = "Couldn't reach the book — check your connection."
      patchRow(pick.id, { placed: false, error: message })
      onError?.(message)
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
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bettorField, pick_id: pick.id }),
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
        onError?.(message)
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
      const message = "Couldn't reach the book — check your connection."
      patchRow(pick.id, { error: message })
      onError?.(message)
    } finally {
      setBusy(null)
    }
  }

  // The pick-one rule, as the rows express it: once a wager sits on one pick,
  // every other pick's stake box goes disabled until it's removed. Null on
  // multi-pick categories, which never lock a row.
  const lockedOutBy =
    !allowsMultiplePicks && placedPickId
      ? (picks.find((pick) => pick.id === placedPickId) ?? null)
      : null
  const lockedOutNote = lockedOutBy
    ? `Remove your $${live[lockedOutBy.id]} on ${lockedOutBy.label} to switch picks`
    : null

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-base leading-snug font-semibold text-pretty text-text-strong">
            {title}
          </div>
          {totalProbability && (
            <div className="tabular mt-0.5 text-[11px] text-text-muted">
              {totalProbability}
            </div>
          )}
          {/* With the radio gone, this line is what explains the greyed-out
              rows below — so it says why they're grey, not just "pick one". */}
          {!allowsMultiplePicks && (
            <div className="mt-0.5 text-[11px] text-text-muted">
              {lockedOutNote ? `Pick one · ${lockedOutNote}` : "Pick one"}
            </div>
          )}
        </div>
      </div>

      {picks.map((pick) => {
        const state = rows[pick.id]
        const hasPlacement = live[pick.id] != null
        const lockedOut = lockedOutBy != null && lockedOutBy.id !== pick.id

        return (
          <div
            key={pick.id}
            className={cn(
              "border-b border-border px-4 py-3 last:rounded-b-[inherit] last:border-b-0",
              hasPlacement ? "bg-indigo-50" : "bg-surface-card"
            )}
          >
            <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
              {/* A named golfer's name links to their profile; an unnamed pick
                  ("Field", "Yes") is plain text. Choosing is the stake box to
                  the right in every category now — the label was only ever a
                  selection target because the radio needed a partner for
                  unlinked picks (#162). The stroke handicap is a badge beside
                  the name either way, never inside the link (#102). */}
              <PickLabel
                label={pick.label}
                playerUserId={pick.player_user_id}
                playerAvatarUrl={pick.player_avatar_url}
                className="min-w-0"
                nameClassName="text-base leading-snug font-medium text-text-strong"
              />
              <OddsChip
                odds={pick.american_odds}
                size="sm"
                fractional={pick.fractional_odds}
                probability={pick.probability}
              />
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              <StakeInput
                value={state.value}
                placed={state.placed}
                error={state.error}
                disabled={busy === pick.id || lockedOut}
                disabledReason={lockedOut ? lockedOutNote : null}
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
                  className="-mr-2 inline-flex min-h-11 cursor-pointer items-center px-2 text-[11px] font-medium text-loss transition-colors duration-fast ease-standard hover:text-loss-strong"
                >
                  ✕ Remove bet
                </button>
              )}
            </div>
            </div>

            {/* Explicit place-confirm: locking in a wager takes a second,
                deliberate tap — never a stray Enter. */}
            {state.confirming === "place" && (
              <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2.5">
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
              <div className="mt-2 rounded-lg border border-loss-border bg-loss-surface px-3 py-2.5">
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
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
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
