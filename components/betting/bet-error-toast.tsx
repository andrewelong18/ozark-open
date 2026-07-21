"use client"

import * as React from "react"

// Floating, dismissible error notification for the bet menu. Rule violations
// used to render inline under the stake input, where a long string wrapped in
// the ~108px column and shoved the input around. Surfacing them here — a fixed
// bar above the tally strip — keeps the form field perfectly still; the input
// only turns its border red to say "this one." Loss tone, auto-dismisses.

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

  if (!message) return null

  return (
    // Sits above the fixed tally bar; the wrapper ignores pointer events so it
    // never blocks the menu, but the card itself stays interactive.
    <div className="pointer-events-none fixed inset-x-0 bottom-[4.75rem] z-40 px-4">
      <div
        role="alert"
        className="pointer-events-auto mx-auto flex max-w-[var(--container-max,1120px)] items-start gap-3 rounded-lg border border-loss-border bg-loss-surface px-3.5 py-3 shadow-[0_8px_24px_rgba(31,29,60,0.16)]"
      >
        <span
          aria-hidden
          className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-loss text-[13px] leading-none font-bold text-white"
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
          className="-mr-1 shrink-0 cursor-pointer rounded-md px-1 text-loss-strong/60 transition-colors hover:text-loss-strong"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
