"use client"

import { useState } from "react"
import Image from "next/image"
import { Coins, Layers, Scale, Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

// "How this pool works" — the Sprint 16 first-run explainer (Competitive
// Analysis §1.2), reused two ways: inline as the last onboarding step, and as
// a re-openable panel from the dashboard. Content mirrors the enforced rules
// (PRD §7 / lib/validation.ts) so nobody's taught a rule the app doesn't keep.
// The pick-count range is passed in from the tournaments row — never hardcoded.

export type HowItWorksCard = {
  icon: typeof Coins
  title: string
  body: string
  // Jake, one per step — the walkthrough's hero. Sources are ~1.6–1.9 wide with
  // a white or transparent background, which is why they can sit straight on the
  // white card with no framing.
  photo: string
}

// The explainer content, shared by the carousel below and the profile
// "How it works" tab (which renders these statically).
export function howItWorksCards(
  minPicks: number,
  maxPicks: number
): HowItWorksCard[] {
  return [
    {
      icon: Coins,
      title: "One shared pot, no house",
      body: "The Ozark Open is pari-mutuel. Everyone's entry fees make the pot — there's no house and no rake. At the end it pays itself back out in proportion to each bettor's theoretical winnings.",
      photo: "/onboarding/jake-step-1.jpg",
    },
    {
      icon: Layers,
      title: "Betting comes in phases",
      body: `The menu opens in phases across the weekend. Place at least ${minPicks} picks across the two phases combined — up to ${maxPicks} in any one phase — and spread your entry across the bets you like.`,
      photo: "/onboarding/jake-step-2.png",
    },
    {
      icon: Scale,
      title: "Hit your entry exactly",
      body: "Your total wagered has to equal your entry fee exactly by the time Phase 2 closes. Being under while betting's still open is fine — just don't leave money on the table.",
      photo: "/onboarding/jake-step-3.jpg",
    },
    {
      icon: Eye,
      title: "Everything reveals at close",
      body: "While a bet is open, nobody can see who you took or how much. The moment it closes, everyone's picks and amounts go public. Around here, that's a feature.",
      photo: "/onboarding/jake-step-4.jpg",
    },
  ]
}

export function HowItWorks({
  minPicks,
  maxPicks,
  onDone,
  doneLabel = "Got it",
  bare = false,
}: {
  minPicks: number
  maxPicks: number
  onDone: () => void
  doneLabel?: string
  /** Drop the card chrome — for when something else already supplies a frame. */
  bare?: boolean
}) {
  const specs = howItWorksCards(minPicks, maxPicks)
  const [index, setIndex] = useState(0)
  const spec = specs[index]
  const isLast = index === specs.length - 1

  // Fixed height so the card doesn't grow and shrink with each step's copy.
  // Measured from the tallest of the four steps at every width: 534px below sm
  // (the card reaches max-w-md at a 496px viewport while the photo is still
  // full width) and 482px from sm up, where the photo drops to 4/5. The tiers
  // are keyed to the same breakpoint as the photo so neither one leaves a band
  // where copy can still push the card taller. Slack lands between the copy and
  // the controls, identically on all four steps.
  const body = (
    <>
      {/* The hero: Jake for this step, inset from the card edges with the brand
          rail flush under him — 4/5 width from sm up, where a full-width photo
          reads too big. All four are mounted and cross-fade on Next, so the
          browser has them by the time you click and the box never flashes empty.
          object-bottom keeps him standing on the rail; the 8/5 box is taller
          than the widest source, so every photo fills the box's width. */}
      <div className="px-4">
        {/* One wrapper sizes the photo and the rail together, so the rail always
            tucks to exactly the photo's width. */}
        <div className="mx-auto w-full sm:w-4/5">
          <div className="relative aspect-[8/5] w-full">
            {specs.map((s, i) => (
              <Image
                key={s.photo}
                src={s.photo}
                alt=""
                fill
                priority={i === 0}
                sizes="(max-width: 640px) 85vw, 336px"
                aria-hidden={i !== index}
                className={
                  "object-contain object-bottom transition-opacity duration-slow ease-standard " +
                  (i === index ? "opacity-100" : "opacity-0")
                }
              />
            ))}
          </div>
          {/* -mt-px so the rail overlaps the photo's last pixel: contained
              images round to a sub-pixel height, and the leftover sliver of
              white card read as a hairline between Jake and the rail. */}
          <div
            aria-hidden
            className="-mt-px h-1.5 w-full rounded-sm bg-indigo-700 shadow-md"
          />
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="font-heading text-2xl text-text-strong">{spec.title}</div>
          <p className="text-sm leading-normal text-text-muted">{spec.body}</p>
        </div>

        {/* Pinned to the bottom so the dots and buttons hold one baseline no
            matter how many lines the copy wraps to. */}
        <div className="mt-auto flex items-center justify-center gap-2" aria-hidden>
          {specs.map((_, i) => (
            <span
              key={i}
              className={
                "size-1.5 rounded-full transition-colors " +
                (i === index ? "bg-primary" : "bg-border")
              }
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            Back
          </Button>
          <span className="text-xs text-text-muted">
            {index + 1} of {specs.length}
          </span>
          {isLast ? (
            <Button size="sm" onClick={onDone}>
              {doneLabel}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setIndex((i) => i + 1)}>
              Next
            </Button>
          )}
        </div>
      </CardContent>
    </>
  )

  // Inside the dashboard accordion the card chrome would be a second frame
  // within the accordion's own — one border, one shadow and one radius too
  // many. Same content, same measured heights, no double box.
  if (bare)
    return (
      <div className="flex min-h-[33.5rem] flex-col gap-4 py-4 sm:min-h-[30.5rem]">
        {body}
      </div>
    )

  return (
    <Card accent elevated className="min-h-[33.5rem] sm:min-h-[30.5rem]">
      {body}
    </Card>
  )
}
