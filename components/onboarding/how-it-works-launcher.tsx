"use client"

import { useState } from "react"

import { HowItWorks } from "@/components/onboarding/how-it-works"
import { AccordionSection } from "@/components/ui/accordion-section"

// The persistent re-open entry point for the Sprint 16 walkthrough. Drops
// anywhere a server page can supply the tournament's pick-count range; toggles
// the same cards the first-run flow uses.
//
// It was a ghost button that grew the walkthrough out of itself; it is now the
// third accordion on the dashboard, so the page reads as three headings you can
// open rather than one button among two open reference cards. The carousel
// behind it is unchanged — Jake, the four steps, the dots — minus its own card
// frame, which the accordion now supplies.
export function HowItWorksLauncher({
  minPicks,
  maxPicks,
}: {
  minPicks: number
  maxPicks: number
}) {
  // Owned here rather than inside AccordionSection: "Close" on the last step
  // has to collapse the section, and the section's own state is private.
  const [open, setOpen] = useState(false)

  return (
    <AccordionSection
      title="How the Pool Works"
      glyph="⛳"
      open={open}
      onOpenChange={setOpen}
      bodyClassName="px-1"
    >
      <HowItWorks
        bare
        minPicks={minPicks}
        maxPicks={maxPicks}
        doneLabel="Close"
        onDone={() => setOpen(false)}
      />
    </AccordionSection>
  )
}
