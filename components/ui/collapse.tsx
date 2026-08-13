"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A disclosure that animates its height, with no JS measurement and without
 * leaving its content in the DOM while closed.
 *
 * THE TECHNIQUE. Radix's Accordion measures the panel and writes a
 * --radix-accordion-content-height for its keyframes to interpolate. There is
 * no Radix here and no animation library, so this uses the CSS-only equivalent:
 * a grid whose single track goes `0fr → 1fr`. The browser resolves the fraction
 * against the content's own height — the number Radix goes to JS for.
 *
 * WHY THE MOUNT DANCE. The naive version of this keeps content mounted always,
 * so the track has something to measure. Sprint 12 shipped that, measured it,
 * and reverted the whole thing, because "present but clipped" is not the same
 * as "absent":
 *
 *   - `overflow: hidden` at `0fr` hides content visually but does NOT empty its
 *     bounding box. The text still answers a query and still reports visible.
 *     On the closed-bet reveal that meant bettor names were findable while
 *     collapsed, which would have forced e2e/bets-menu.spec.ts (#103) to stop
 *     asserting they are absent.
 *   - Form controls stayed in the document, so `getByLabel("Playing golfer")`
 *     matched two checkboxes and broke e2e/admin-approval.spec.ts.
 *
 * The revert was the right call for that implementation and the wrong
 * conclusion about the technique. This version mounts on first open and
 * unmounts once the CLOSE transition finishes, so the steady closed state is
 * genuinely empty — both guards hold — and both directions still animate. The
 * only window where content exists while visually closed is the ~180ms of the
 * closing transition itself.
 *
 * Unmounting on `transitionend` is the same shape as BetErrorToast's exit
 * latch, including its hazard: if the transition never fires, the node never
 * leaves. Hence CLOSE_FALLBACK_MS, and hence the reduced-motion floor in
 * globals.css being 0.01ms rather than `animation: none` — at 0.01ms a real
 * transition still runs and still fires its event.
 *
 * Two details that look like style and are not:
 *   1. The middle element's `overflow-hidden` supplies the `min-height: 0` a
 *      `0fr` track needs. Without it the content refuses to shrink.
 *   2. Borders and padding go on the INNER element, never the track — on the
 *      track they survive at `0fr` and leave a 1px line behind.
 */

/** Ceiling on the close, so a suppressed transition can't strand the panel. */
const CLOSE_FALLBACK_MS = 600

export function Collapse({
  open,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { open: boolean }) {
  // `mounted` trails `open`: true the moment it opens, false only once the
  // closing transition has finished. `expanded` is the class the transition
  // actually reads, and it lags `mounted` by one frame on the way in.
  const [mounted, setMounted] = React.useState(open)
  const [expanded, setExpanded] = React.useState(open)

  // Both adjustments happen during render rather than in an effect. That is
  // React's sanctioned escape hatch for state derived from props — it discards
  // the render and re-runs before paint — and it is what
  // react-hooks/set-state-in-effect requires; the effect version was rejected.
  if (open && !mounted) setMounted(true)
  if (!open && expanded) setExpanded(false)

  // Opening needs two frames: one where the content is mounted at `0fr`, and a
  // second where the class flips to `1fr`, so the transition has a value to
  // start FROM. Flipping both in one commit produces a snap — precisely the bug
  // this component exists to fix. Closing needs no such dance, because the
  // element is already at `1fr` when `open` goes false.
  React.useEffect(() => {
    if (!open || !mounted || expanded) return
    const id = requestAnimationFrame(() => setExpanded(true))
    return () => cancelAnimationFrame(id)
  }, [open, mounted, expanded])

  React.useEffect(() => {
    if (open || !mounted) return
    const id = setTimeout(() => setMounted(false), CLOSE_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [open, mounted])

  if (!mounted) return null

  return (
    <div
      data-state={expanded ? "open" : "closed"}
      onTransitionEnd={(e) => {
        // Only this element's own height transition counts — children have
        // their own colour transitions and would unmount the panel mid-open.
        if (e.target !== e.currentTarget) return
        if (e.propertyName !== "grid-template-rows") return
        if (!open) setMounted(false)
      }}
      className={cn(
        "grid transition-[grid-template-rows] duration-base ease-standard",
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
      {...props}
    >
      <div className="overflow-hidden">
        {/* inert while closing: the panel is still in the document for the
            length of the transition, and its controls should not be tabbable
            on the way out. */}
        <div inert={!open} className={className}>
          {children}
        </div>
      </div>
    </div>
  )
}
