"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { BET_FOOTER_TOAST_SLOT } from "@/components/betting/bet-footer"

// Floating, dismissible error notification for the bet menu. Rule violations
// used to render inline under the stake input, where a long string wrapped in
// the ~108px column and shoved the input around. Surfacing them here keeps the
// form field perfectly still; the input only turns its border red to say
// "this one." Loss tone, auto-dismisses.
//
// WHERE it floats used to be a hardcoded `bottom-[4.75rem]` — a guess at the
// tally bar's height. Two ways that was wrong on a phone: the bar's headline
// line can wrap, making it taller, and a non-participant browsing the menu has
// no bar at all, so the toast hovered above nothing. Now the bar renders a slot
// and the toast portals into it, stacked directly above whatever height the bar
// actually is. No slot (no bar) → pinned to the bottom edge, safe-area padded.

/** The slot never moves once the page is up, so there is nothing to subscribe
 * to; each toast render re-reads the snapshot anyway. */
const subscribeNever = () => () => {}

export function BetErrorToast({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss: () => void
}) {
  // Keep the latest onDismiss without making it a timer dependency, so a new
  // parent render doesn't restart the countdown.
  const onDismissRef = React.useRef(onDismiss)
  React.useEffect(() => {
    onDismissRef.current = onDismiss
  })

  React.useEffect(() => {
    if (!message) return
    const id = setTimeout(() => onDismissRef.current(), 5000)
    return () => clearTimeout(id)
  }, [message])

  // The slot is rendered by BetSlipSummary — a server component — so it can't
  // be a ref, and on the server there is no document to look in at all.
  // useSyncExternalStore gives the two answers separately without a
  // setState-in-effect: null while rendering server-side, the live node once
  // the client is running. getElementById hands back the same node every call,
  // so the snapshot is referentially stable and never resubscribes.
  const slot = React.useSyncExternalStore(
    subscribeNever,
    () => document.getElementById(BET_FOOTER_TOAST_SLOT),
    () => null
  )

  if (!message) return null

  const card = (
    <div
      role="alert"
      className="pointer-events-auto mx-auto flex max-w-[var(--container-max,1120px)] items-start gap-3 rounded-lg border border-loss-border bg-loss-surface px-3.5 py-3 shadow-[0_8px_24px_rgba(31,29,60,0.16)]"
    >
      <span
        aria-hidden
        className="mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-loss text-[13px] leading-none font-bold text-white"
      >
        !
      </span>
      <p className="min-w-0 flex-1 text-sm leading-normal text-loss-strong">
        {message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mt-1 -mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-loss-strong/60 transition-colors hover:text-loss-strong"
      >
        ✕
      </button>
    </div>
  )

  // Above the tally bar, in its flow.
  if (slot) return createPortal(card, slot)

  // No tally bar on this page — sit on the bottom edge instead of above a
  // phantom one. The wrapper ignores pointer events so it never blocks the menu
  // behind it; the card itself stays interactive.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {card}
    </div>
  )
}
