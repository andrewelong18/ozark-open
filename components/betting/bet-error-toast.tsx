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

// MOTION (Sprint 12), modelled on Sonner's data-state mechanics: the card
// carries data-state="open" | "closed" and tw-animate-css drives enter and
// exit off it. The exit is shorter than the enter on the principle that old
// content should leave quickly rather than compete for attention.
//
// The hard part is that there IS no exit to play by default. `message` is a
// controlled prop from BetsMenu's toastError, and `if (!message) return null`
// means React removes the node the instant the parent clears it — a node
// React has already unmounted cannot animate. @starting-style doesn't help
// either; that animates an element which STAYS in the DOM while display
// changes. So the card latches its own copy of the message and outlives the
// prop, unmounting itself on animationend.
//
// That is precisely why the reduced-motion block in globals.css zeroes
// durations to 0.01ms instead of `animation: none`. With `none` the browser
// creates no animation, animationend never fires, and this card would sit on
// the screen forever. For the same reason none of the animation classes below
// are motion-safe: gated — the unmount depends on them existing.

/** The slot never moves once the page is up, so there is nothing to subscribe
 * to; each toast render re-reads the snapshot anyway. */
const subscribeNever = () => () => {}

/** Ceiling on the exit. If the animation is suppressed by something outside
 * our control (a print stylesheet, an extension, a browser that skips
 * animations on a backgrounded tab), animationend never arrives — this makes
 * sure the card still leaves rather than stranding. Comfortably longer than
 * --dur-exit so it never races the real thing. */
const EXIT_FALLBACK_MS = 600

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

  // The latched copy is what gets rendered, so the card survives the prop
  // being cleared long enough to animate out.
  // Adjusted during render rather than in an effect: this is derived state
  // reacting to a prop, which React sanctions doing inline (it discards the
  // render and re-runs immediately, before paint). In an effect it would be a
  // cascading render, and react-hooks/set-state-in-effect rejects it.
  const [latched, setLatched] = React.useState(message)
  if (message != null && message !== latched) setLatched(message)
  const leaving = message == null && latched != null

  React.useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => setLatched(null), EXIT_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [leaving])

  if (latched == null) return null

  const card = (
    <div
      role="alert"
      data-state={leaving ? "closed" : "open"}
      onAnimationEnd={(e) => {
        // The dismiss button is inside this element and has its own
        // transitions; only the card's own exit should unmount it.
        if (e.target !== e.currentTarget) return
        if (leaving) setLatched(null)
      }}
      className={[
        "pointer-events-auto mx-auto flex max-w-[var(--container-max,1120px)] items-start gap-3 rounded-lg border border-loss-border bg-loss-surface px-3.5 py-3 shadow-[0_8px_24px_rgba(31,29,60,0.16)]",
        "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-bottom-2 data-[state=open]:duration-slow data-[state=open]:ease-out",
        // fill-mode-forwards matters: tw-animate-css defaults fill-mode to
        // none, so without it the card snaps back to full opacity for the one
        // frame between animationend and React removing the node.
        "data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-bottom-1 data-[state=closed]:duration-exit data-[state=closed]:ease-exit data-[state=closed]:fill-mode-forwards",
      ].join(" ")}
    >
      <span
        aria-hidden
        className="mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-loss text-[13px] leading-none font-bold text-white"
      >
        !
      </span>
      {/* `latched`, not `message` — during the exit the prop is already null
          and rendering it would blank the text mid-animation. */}
      <p className="min-w-0 flex-1 text-sm leading-normal text-loss-strong">
        {latched}
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
