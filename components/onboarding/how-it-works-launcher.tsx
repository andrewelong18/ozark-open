"use client"

import { useState } from "react"
import { HelpCircle } from "lucide-react"

import { HowItWorks } from "@/components/onboarding/how-it-works"
import { Button } from "@/components/ui/button"
import { Collapse } from "@/components/ui/collapse"

// The persistent re-open entry point for the Sprint 16 walkthrough. Drops
// anywhere a server page can supply the tournament's pick-count range; toggles
// the same cards the first-run flow uses.
export function HowItWorksLauncher({
  minPicks,
  maxPicks,
}: {
  minPicks: number
  maxPicks: number
}) {
  const [open, setOpen] = useState(false)

  // The walkthrough grows out of the button rather than replacing it in a
  // single frame — it is a tall block appearing mid-dashboard, and a snap
  // shoves everything below it out of view with no explanation.
  return (
    <>
      {!open && (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <HelpCircle className="size-4" aria-hidden />
          How this pool works
        </Button>
      )}
      <Collapse open={open}>
        <HowItWorks
          minPicks={minPicks}
          maxPicks={maxPicks}
          doneLabel="Close"
          onDone={() => setOpen(false)}
        />
      </Collapse>
    </>
  )
}
