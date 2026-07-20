"use client"

import { useState } from "react"
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
    },
    {
      icon: Layers,
      title: "Betting comes in phases",
      body: `The menu opens in phases across the weekend. In each phase you place ${minPicks}–${maxPicks} picks — spread your entry across the bets you like.`,
    },
    {
      icon: Scale,
      title: "Hit your entry exactly",
      body: "Your total wagered has to equal your entry fee exactly by the time Phase 2 closes. Being under while betting's still open is fine — just don't leave money on the table.",
    },
    {
      icon: Eye,
      title: "Everything reveals at close",
      body: "While a bet is open, nobody can see who you took or how much. The moment it closes, everyone's picks and amounts go public. Around here, that's a feature.",
    },
  ]
}

export function HowItWorks({
  minPicks,
  maxPicks,
  onDone,
  doneLabel = "Got it",
}: {
  minPicks: number
  maxPicks: number
  onDone: () => void
  doneLabel?: string
}) {
  const specs = howItWorksCards(minPicks, maxPicks)
  const [index, setIndex] = useState(0)
  const spec = specs[index]
  const Icon = spec.icon
  const isLast = index === specs.length - 1

  return (
    <Card accent elevated>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent-gold text-accent-gold-foreground">
            <Icon className="size-6" aria-hidden />
          </span>
          <div className="font-heading text-2xl text-text-strong">{spec.title}</div>
          <p className="text-sm leading-normal text-text-muted">{spec.body}</p>
        </div>

        <div className="flex items-center justify-center gap-2" aria-hidden>
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
    </Card>
  )
}
