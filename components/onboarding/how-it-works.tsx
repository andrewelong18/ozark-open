"use client"

import { useState } from "react"
import Image from "next/image"
import { Coins, Layers, Scale, Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { TournamentRules } from "@/lib/validation"

// "How this pool works" — the Sprint 16 first-run explainer (Competitive
// Analysis §1.2), reused two ways: inline as an onboarding step, and as a
// re-openable panel from the dashboard. Content mirrors the enforced rules
// (PRD §7 / lib/validation.ts, per phase since Sprint 30) so nobody's taught
// a rule the app doesn't keep. The numbers are passed in from the
// tournaments row — never hardcoded.

/** The rule parameters the copy interpolates — all off the tournaments row. */
export type HowItWorksRules = Pick<
  TournamentRules,
  "min_picks_per_phase" | "entry_fee_min" | "entry_fee_max"
>

export type HowItWorksCard = {
  icon: typeof Coins
  title: string
  body: string
  // Jake, one per step — the walkthrough's hero. Sources are ~1.6–1.9 wide with
  // a white or transparent background, which is why they can sit straight on the
  // white card with no framing.
  photo: string
}

// The explainer content, shared by the carousel below and anything else that
// wants the four steps statically.
//
// Kept to four short steps on purpose (Sept 16, 2026): the point a member has
// to leave with is that Phase 1 money and Phase 2 money are separate, and that
// each phase needs its own five picks. The self-bet line is deliberately NOT
// here — it lives on the House Rules card, on the entry form's playing
// checkbox, in the compliance warnings, and is hard-blocked at placement
// (lib/validation.ts), so nobody can act on not knowing it.
export function howItWorksCards(rules: HowItWorksRules): HowItWorksCard[] {
  const { min_picks_per_phase: minPicks, entry_fee_min: min, entry_fee_max: max } = rules
  return [
    {
      icon: Coins,
      title: "Two pots, no house",
      body: "Phase 1 and Phase 2 each have their own pot, made from everyone's entries. At the end each pot is split among the winners in that phase. No house, no rake.",
      photo: "/onboarding/jake-step-1.jpg",
    },
    {
      icon: Layers,
      title: "Separate money for each phase",
      body: `Enter each phase for $${min}–$${max} — one, the other, or both. Your Phase 1 money can only be bet in Phase 1, and your Phase 2 money only in Phase 2.`,
      photo: "/onboarding/jake-step-2.png",
    },
    {
      icon: Scale,
      title: `${minPicks} picks minimum, and wager it all`,
      body: `In every phase you enter, place at least ${minPicks} picks and wager the whole entry. Leave money unwagered and the first $${min} stays in the pot — the rest comes back.`,
      photo: "/onboarding/jake-step-3.jpg",
    },
    {
      icon: Eye,
      title: "Everything shows at close",
      body: "Nobody can see your picks while a bet is open. The moment it closes, everyone's picks and amounts go public. Around here, that's a feature.",
      photo: "/onboarding/jake-step-4.jpg",
    },
  ]
}

export function HowItWorks({
  rules,
  onDone,
  doneLabel = "Got it",
  bare = false,
}: {
  rules: HowItWorksRules
  onDone: () => void
  doneLabel?: string
  /** Drop the card chrome — for when something else already supplies a frame. */
  bare?: boolean
}) {
  const specs = howItWorksCards(rules)
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
