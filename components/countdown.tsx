"use client"

import * as React from "react"

// Calm countdown to a fixed moment (the opening ceremony). Native Date + a
// 1s interval — no date library is installed, and none is warranted. Kept
// deliberately low-key per the brand's "no countdown-timer anxiety" rule:
// neutral ink, tabular numbers, no red, no urgency.

type Parts = { days: number; hours: number; minutes: number; seconds: number }

function partsUntil(target: number, now: number): Parts {
  const diff = Math.max(0, target - now)
  const s = Math.floor(diff / 1000)
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}

export function Countdown({ target }: { target: Date }) {
  const targetMs = target.getTime()

  // Start from 0s so the server-rendered markup and the first client render
  // agree; the real values arrive on mount, avoiding a hydration mismatch.
  const [now, setNow] = React.useState<number | null>(null)

  React.useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const reached = now != null && now >= targetMs
  const parts = partsUntil(targetMs, now ?? targetMs)

  if (reached) {
    return (
      <p className="font-heading text-lg text-text-strong">It&apos;s here — tee it up.</p>
    )
  }

  const cells: { label: string; value: number }[] = [
    { label: "Days", value: parts.days },
    { label: "Hrs", value: parts.hours },
    { label: "Min", value: parts.minutes },
    { label: "Sec", value: parts.seconds },
  ]

  return (
    <div className="grid grid-cols-4 gap-2" aria-live="off">
      {cells.map((c) => (
        <div
          key={c.label}
          className="flex flex-col items-center rounded-lg border border-border bg-surface-sunken px-1 py-2"
        >
          <span className="tabular font-heading text-2xl leading-none text-text-strong">
            {String(c.value).padStart(2, "0")}
          </span>
          <span className="mt-1 text-[10px] font-medium tracking-wider text-text-muted uppercase">
            {c.label}
          </span>
        </div>
      ))}
    </div>
  )
}
