"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * A horizontally scrolling row that says so.
 *
 * The filter rows on /bets scroll sideways on a phone — five categories plus an
 * "All Categories" reset do not fit at 390px — and there was nothing on screen
 * admitting it. A chip row that ends flush at the viewport edge reads as a row
 * that ends, so "Prop Bet" was unreachable-looking rather than unreachable.
 *
 * The fade is painted only on the side that actually has more content, which is
 * why this is JS and not a `mask-image` one-liner. On a desktop where every chip
 * fits, a permanent fade over the last chip would be a lie — it would imply
 * content that isn't there, which is worse than no affordance at all.
 *
 * Deliberately NOT a scroll-driven CSS animation: `animation-timeline: scroll()`
 * would express this natively, but Safari support is recent enough that a phone
 * a year or two old would silently get nothing — and a phone is the device this
 * page is read on.
 */
export function ScrollFadeRow({
  className,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<"div">) {
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    // 1px of slack: sub-pixel widths mean scrollLeft rarely reaches the exact
    // maximum, so a strict comparison leaves the end fade painted forever.
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges((current) =>
      current.start === start && current.end === end
        ? current
        : { start, end }
    )
  }, [])

  // On every render, because the chips themselves can change (the round row is
  // rebuilt when the phase flips). The equality guard in measure() is what stops
  // that being a render loop.
  useLayoutEffect(measure)

  // ...and on the two things that change scrollability without a render.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure])

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={measure}
        className={cn(
          "flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className
        )}
        {...rest}
      >
        {children}
      </div>
      {/* pointer-events-none so the fade never eats a tap on the chip beneath
          it — the chip at the edge is precisely the one being advertised. */}
      <FadeEdge side="start" visible={edges.start} />
      <FadeEdge side="end" visible={edges.end} />
    </div>
  )
}

function FadeEdge({ side, visible }: { side: "start" | "end"; visible: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 w-8 transition-opacity duration-fast ease-standard",
        side === "start"
          ? "left-0 bg-gradient-to-r from-background to-transparent"
          : "right-0 bg-gradient-to-l from-background to-transparent",
        visible ? "opacity-100" : "opacity-0"
      )}
    />
  )
}
