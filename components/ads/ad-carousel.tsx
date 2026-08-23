"use client"

import * as React from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Ad } from "@/lib/ads"

// The fake-sponsor slot (Sprint 13). Rotates through the creatives one at a
// time, sliding horizontally, and advances itself every 5 seconds.
//
// Motion: a single translated track rather than per-slide enter/exit animation
// — one transform, no stacking contexts, and the browser can hand it to the
// compositor. `ease-standard` + `duration-slow` puts it in the PRODUCTIVE tier
// on purpose (DESIGN_SYSTEM.md §4): this thing loops forever in the corner of
// the page, and an expressive curve on a repeating ambient element reads as a
// nag. Reduced motion needs no special case here — globals.css floors every
// transition to 0.01ms, so the slide becomes an instant swap on its own.
//
// Rotation pauses on hover and on keyboard focus, which is also the WCAG 2.2.2
// escape hatch for auto-updating content: there is always a way to stop it and
// always a manual control.
//
// The pause is gated on `pointerType === "mouse"` rather than plain
// onMouseEnter, and that is load-bearing rather than fussy. A touchscreen
// synthesises a mouseenter on tap and never sends the matching mouseleave, so
// the naive version stopped rotating for good the first time anyone touched the
// slot — verified on an emulated Pixel 7, where `(hover: hover)` is false. This
// pool lives on phones, so that bug would have been the only behaviour anyone
// ever saw. Related: #165, the same sticky-:hover problem app-wide.

const ROTATE_MS = 5000

export function AdCarousel({
  ads,
  className,
}: {
  ads: Ad[]
  className?: string
}) {
  const count = ads.length
  const [index, setIndex] = React.useState(0)
  const [paused, setPaused] = React.useState(false)

  // `index` is a dependency so a manual click restarts the clock — otherwise
  // tapping next at 4.9s would flip again 100ms later.
  React.useEffect(() => {
    if (paused || count < 2) return
    const id = setTimeout(
      () => setIndex((i) => (i + 1) % count),
      ROTATE_MS
    )
    return () => clearTimeout(id)
  }, [index, paused, count])

  if (count === 0) return null

  const go = (next: number) => setIndex(((next % count) + count) % count)

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Sponsored"
      className={cn("w-full max-w-100", className)}
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setPaused(false)}
      // `:focus-visible`, not plain focus. Clicking or tapping a dot focuses it
      // too, so the ungated version froze rotation on the first interaction —
      // the same dead-carousel symptom as the pointer bug above, reached by a
      // second route. This pauses for someone tabbing through and not for
      // someone who just tapped.
      onFocusCapture={(e) =>
        e.target instanceof Element &&
        e.target.matches(":focus-visible") &&
        setPaused(true)
      }
      onBlurCapture={() => setPaused(false)}
    >
      <div className="overflow-hidden rounded-lg border border-border bg-surface-card">
        {/* Viewport. aspect-[4/3] reserves the box before the image loads, so
            the rail never reflows underneath the activity feed. */}
        <div className="group relative aspect-4/3 overflow-hidden">
          <div
            className="flex h-full transition-transform duration-slow ease-standard"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {ads.map((ad, i) => {
              const active = i === index
              const img = (
                <Image
                  src={`/ads/${ad.file}`}
                  alt={ad.alt}
                  width={800}
                  height={600}
                  sizes="(min-width: 1024px) 360px, 400px"
                  className="h-full w-full object-cover"
                  priority={i === 0}
                />
              )
              return (
                <div
                  key={ad.file}
                  className="h-full w-full shrink-0"
                  aria-hidden={!active}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${count}`}
                >
                  {ad.href ? (
                    <a
                      href={ad.href}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      // Off-screen slides stay out of the tab order.
                      tabIndex={active ? undefined : -1}
                      className="block h-full w-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-700"
                    >
                      {img}
                    </a>
                  ) : (
                    img
                  )}
                </div>
              )
            })}
          </div>

          {count > 1 && (
            <>
              <ArrowButton
                side="left"
                label="Previous ad"
                onClick={() => go(index - 1)}
              />
              <ArrowButton
                side="right"
                label="Next ad"
                onClick={() => go(index + 1)}
              />
            </>
          )}
        </div>

        {/* Caption bar: the "Sponsored" tag is part of the joke, the dots are
            the navigation. Both live outside the image so a creative never has
            to leave room for chrome. */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5">
          <span className="text-[10px] font-semibold tracking-wider text-text-muted uppercase">
            Sponsored
          </span>
          {count > 1 && (
            <div className="flex items-center gap-0.5">
              {ads.map((ad, i) => (
                <button
                  key={ad.file}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show ad ${i + 1} of ${count}`}
                  aria-current={i === index}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-700"
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full transition-colors duration-base",
                      i === index
                        ? "bg-indigo-700"
                        : "bg-border-strong hover:bg-text-muted"
                    )}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// Overlaid chevron. A 44px hit area with a small visual inside it — subtle by
// default, firmer once the pointer is in the slot or the button has focus.
function ArrowButton({
  side,
  label,
  onClick,
}: {
  side: "left" | "right"
  label: string
  onClick: () => void
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700",
        side === "left" ? "left-0" : "right-0"
      )}
    >
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full bg-surface-card/70 text-text-strong shadow-xs",
          "opacity-0 transition-opacity duration-base ease-standard",
          "group-hover:opacity-100 group-focus-within:opacity-100",
          // Touch devices get no hover, so keep them permanently visible there.
          "max-[1023px]:opacity-70"
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
    </button>
  )
}
