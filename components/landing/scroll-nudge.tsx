"use client"

import * as React from "react"

/**
 * A nudge to scroll, shown only if someone has not.
 *
 * The taste skill bans scroll cues outright, on the grounds that a visitor
 * looking at a hero already knows what scrolling is. Andrew asked for one
 * anyway, and he is right about this page specifically: the hero fills the
 * viewport edge to edge with no visible seam, so there is nothing to suggest
 * the page continues. Deliberate deviation, recorded in the brief.
 *
 * It earns its place by being conditional. It appears only after four seconds
 * of stillness, and it never appears at all for anyone who has already started
 * scrolling. Once it goes, it does not come back.
 *
 * Detection is an IntersectionObserver on a sentinel at the top of the page,
 * not a scroll listener: no per-frame work, and it settles correctly on load
 * even if the browser restores a previous scroll position.
 */
export function ScrollNudge() {
  const [visible, setVisible] = React.useState(false)
  const sentinelRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let done = false

    const retire = () => {
      done = true
      if (timer) clearTimeout(timer)
      setVisible(false)
      io.disconnect()
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (done) return
        if (!entry.isIntersecting) {
          // Already scrolled, or scrolled while waiting. Never show it.
          retire()
          return
        }
        timer = setTimeout(() => {
          if (!done) setVisible(true)
        }, 4000)
      },
      { threshold: 0 }
    )
    io.observe(el)

    return () => {
      if (timer) clearTimeout(timer)
      io.disconnect()
    }
  }, [])

  return (
    <>
      <div ref={sentinelRef} className="ozk-nudge-sentinel" aria-hidden />
      {/* aria-hidden: this is a hint about the page's own affordance, not
          content, and a screen reader user is not scrolling by eye. */}
      <div className="ozk-nudge" data-visible={visible} aria-hidden>
        <span className="ozk-nudge-label">Scroll</span>
        <span className="ozk-nudge-line" />
      </div>
    </>
  )
}
