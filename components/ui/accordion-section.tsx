"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Collapse } from "@/components/ui/collapse"

// A card-shaped disclosure: a tinted header row that is the whole control, and
// a panel that grows out of it. The dashboard stacks three of these — alerts,
// house rules, how the pool works — so the page opens as a short list of
// headings instead of a scroll of reference material nobody reads twice.
//
// The animation and the mount/unmount latch belong to <Collapse>; this adds the
// header, the count, and the chevron. Closed is genuinely empty, not clipped —
// see collapse.tsx for why that distinction is load-bearing rather than tidy.

const TONES = {
  indigo: {
    header: "border-indigo-100 bg-indigo-50 hover:bg-indigo-100/70",
    title: "text-indigo-800",
    badge: "bg-indigo-700",
  },
  caution: {
    header: "border-caution-border bg-caution-surface hover:bg-caution-surface/70",
    title: "text-caution-strong",
    badge: "bg-caution-strong",
  },
  win: {
    header: "border-win-border bg-win-surface hover:bg-win-surface/70",
    title: "text-win-strong",
    badge: "bg-win-strong",
  },
} as const

export type AccordionTone = keyof typeof TONES

export type AccordionSectionProps = {
  title: string
  /** Emoji or glyph before the title. Decorative — never the only signal. */
  glyph?: string
  /** Shown as a pill after the title. Omit (or pass undefined) for no count. */
  count?: number
  tone?: AccordionTone
  /** Collapsed unless a caller has a reason; the whole point is a quiet page. */
  defaultOpen?: boolean
  /** Controlled open state — for a panel whose content can close itself. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  className?: string
  /** Padding wrapper around the panel content. Pass "" to go flush. */
  bodyClassName?: string
}

export function AccordionSection({
  title,
  glyph,
  count,
  tone = "indigo",
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  children,
  className,
  bodyClassName = "p-3",
}: AccordionSectionProps) {
  // Uncontrolled by default; controlled when a caller passes `open`, which the
  // walkthrough needs because its own "Close" button has to collapse the panel.
  const [selfOpen, setSelfOpen] = React.useState(defaultOpen)
  const open = openProp ?? selfOpen
  const toggle = () => {
    const next = !open
    setSelfOpen(next)
    onOpenChange?.(next)
  }
  const panelId = React.useId()
  const t = TONES[tone]

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-surface-card shadow-sm",
        className
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          // min-h-11 is the 44px tap target: this is the only control on the
          // card, and on a phone it's the whole reason the content is reachable.
          "flex min-h-11 w-full cursor-pointer items-center gap-2 px-4 py-3 text-left transition-colors duration-fast ease-standard focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          t.header,
          // Only when open — a bottom border over a collapsed panel reads as a
          // stray hairline under the header.
          open && "border-b"
        )}
      >
        {glyph && (
          <span aria-hidden className="text-[15px]">
            {glyph}
          </span>
        )}
        <span className={cn("font-heading text-lg", t.title)}>{title}</span>
        {count !== undefined && (
          <span
            className={cn(
              "tabular inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[13px] leading-none font-bold text-white",
              t.badge
            )}
          >
            {count}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "ml-auto size-4 shrink-0 text-text-muted transition-transform duration-fast ease-standard",
            open && "rotate-180"
          )}
        />
      </button>
      {/* The id stays mounted so aria-controls always resolves, even though
          <Collapse> empties itself when closed. */}
      <div id={panelId}>
        <Collapse open={open} className={bodyClassName || undefined}>
          {children}
        </Collapse>
      </div>
    </div>
  )
}
