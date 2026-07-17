"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OddsChip } from "@/components/betting/odds-chip"
import { MoneyDisplay } from "@/components/betting/money-display"
import { OutcomeBadge } from "@/components/betting/outcome-badge"
import { StatusBadge } from "@/components/betting/status-badge"
import { StakeInput } from "@/components/betting/stake-input"
import { PickRow } from "@/components/betting/pick-row"
import { StatCard } from "@/components/modules/stat-card"
import { BudgetModule } from "@/components/modules/budget-module"
import { ComplianceBanner } from "@/components/modules/compliance-banner"
import { RulesCard } from "@/components/modules/rules-card"
import { EmptyState } from "@/components/modules/empty-state"

/* ------------------------------- scaffolding ------------------------------ */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-2xl text-text-strong">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-6">
      <div className="w-40 shrink-0 text-xs font-semibold tracking-wide text-text-muted uppercase">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

function Swatch({ token, name }: { token: string; name: string }) {
  return (
    <div className="flex w-32 flex-col gap-1">
      <div
        className="h-12 w-full rounded-md border border-border"
        style={{ background: `var(${token})` }}
      />
      <div className="text-xs font-semibold text-text-strong">{name}</div>
      <div className="tabular text-[11px] text-text-muted">{token}</div>
    </div>
  )
}

/* --------------------------------- data ----------------------------------- */

const RAW_RAMPS: { name: string; prefix: string; steps: string[] }[] = [
  {
    name: "Indigo (brand primary)",
    prefix: "--indigo",
    steps: ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"],
  },
  {
    name: "Gold (clubhouse accent)",
    prefix: "--gold",
    steps: ["100", "200", "300", "400", "500", "600", "700"],
  },
  {
    name: "Green (win / open)",
    prefix: "--green",
    steps: ["50", "100", "200", "400", "500", "600", "700", "800"],
  },
  {
    name: "Red (loss)",
    prefix: "--red",
    steps: ["50", "100", "200", "500", "600", "700", "800"],
  },
  {
    name: "Amber (caution)",
    prefix: "--amber",
    steps: ["50", "100", "500", "600", "700"],
  },
  {
    name: "Ink (warm neutrals)",
    prefix: "--ink",
    steps: ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"],
  },
]

const SEMANTIC_SWATCHES: { token: string; name: string }[] = [
  { token: "--background", name: "background" },
  { token: "--surface-card", name: "surface-card" },
  { token: "--surface-sunken", name: "surface-sunken" },
  { token: "--surface-inverse", name: "surface-inverse" },
  { token: "--primary", name: "primary" },
  { token: "--accent-gold", name: "accent-gold" },
  { token: "--accent", name: "accent (neutral)" },
  { token: "--border", name: "border" },
  { token: "--ring", name: "ring" },
  { token: "--win", name: "win" },
  { token: "--loss", name: "loss" },
  { token: "--caution", name: "caution" },
  { token: "--status-open", name: "status-open" },
  { token: "--status-resolved", name: "status-resolved" },
  { token: "--odds-positive", name: "odds-positive" },
  { token: "--money-up", name: "money-up" },
]

const TYPE_SCALE: { name: string; className: string }[] = [
  { name: "3xl / 38px", className: "text-[38px]" },
  { name: "2xl / 30px", className: "text-3xl" },
  { name: "xl / 24px", className: "text-2xl" },
  { name: "lg / 20px", className: "text-xl" },
  { name: "base / 16px", className: "text-base" },
  { name: "sm / 14px", className: "text-sm" },
  { name: "xs / 12px", className: "text-xs" },
]

/* --------------------------------- page ----------------------------------- */

export default function StyleGuidePage() {
  const [stake, setStake] = React.useState("")
  const [placed, setPlaced] = React.useState(false)

  return (
    <div className="mx-auto flex max-w-[var(--container-max,1120px)] flex-col gap-14 px-4 py-10">
      <header className="flex flex-col gap-2">
        <Badge variant="indigo" uppercase>
          Living reference
        </Badge>
        <h1 className="font-heading text-4xl text-text-strong">
          Ozark Open Design System
        </h1>
        <p className="max-w-2xl text-text-body">
          Clubhouse meets sportsbook: royal indigo, clubhouse gold, fairway
          green, on warm cream. Every token and component below is wired to the
          same layer the real screens use.
        </p>
      </header>

      {/* ------------------------------- COLOR ------------------------------ */}
      <Section
        title="Color — raw scale"
        subtitle="Literal brand ramps. Referenced by the semantic layer; used directly only for washes and steps."
      >
        <div className="flex flex-col gap-6">
          {RAW_RAMPS.map((ramp) => (
            <div key={ramp.prefix} className="flex flex-col gap-2">
              <div className="text-sm font-semibold text-text-strong">
                {ramp.name}
              </div>
              <div className="flex flex-wrap gap-1">
                {ramp.steps.map((step) => {
                  const token = `${ramp.prefix}-${step}`
                  return (
                    <div key={token} className="flex flex-col items-center gap-1">
                      <div
                        className="size-11 rounded-md border border-border"
                        style={{ background: `var(${token})` }}
                      />
                      <div className="tabular text-[10px] text-text-muted">
                        {step}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Color — semantic layer"
        subtitle="Role aliases. shadcn names are mapped to DS values; domain roles are added."
      >
        <div className="flex flex-wrap gap-4">
          {SEMANTIC_SWATCHES.map((s) => (
            <Swatch key={s.token} token={s.token} name={s.name} />
          ))}
        </div>
      </Section>

      {/* ---------------------------- TYPOGRAPHY ---------------------------- */}
      <Section
        title="Typography"
        subtitle="Azalea for display/headings only; Montserrat for UI + body; tabular figures for numbers."
      >
        <div className="flex flex-col gap-3">
          <div className="font-heading text-4xl text-text-strong">
            Azalea display — Ozark Open
          </div>
          <div className="text-lg text-text-body">
            Montserrat body — No house, no rake, no profit.
          </div>
          <div className="tabular text-lg font-semibold text-text-strong">
            Tabular numbers — +150 · −130 · $21.87 · 40.0%
          </div>
        </div>
        <Card className="mt-2">
          <CardContent className="flex flex-col gap-1 py-2">
            {TYPE_SCALE.map((t) => (
              <div
                key={t.name}
                className="flex items-baseline justify-between gap-4 border-t border-border py-1.5 first:border-t-0"
              >
                <span className={`${t.className} leading-tight text-text-strong`}>
                  Fairway
                </span>
                <span className="tabular text-xs text-text-muted">{t.name}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </Section>

      {/* ----------------------------- BUTTONS ------------------------------ */}
      <Section title="Button" subtitle="≥44px default touch target. Gold is rationed to one marquee action per screen.">
        <Row label="Variants">
          <Button variant="default">Primary</Button>
          <Button variant="gold">Place Bets →</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Remove</Button>
          <Button variant="link">Link</Button>
        </Row>
        <Row label="Sizes">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
        </Row>
        <Row label="States">
          <Button disabled>Disabled</Button>
          <Button variant="gold" disabled>
            Disabled
          </Button>
        </Row>
      </Section>

      {/* ------------------------------ BADGES ------------------------------ */}
      <Section title="Badge" subtitle="Generic tones. Prefer StatusBadge / OutcomeBadge for bet states.">
        <Row label="Tones">
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="indigo">Indigo</Badge>
          <Badge variant="gold">Gold</Badge>
          <Badge variant="green">Win</Badge>
          <Badge variant="red">Loss</Badge>
          <Badge variant="amber">Caution</Badge>
          <Badge variant="solid">Solid</Badge>
          <Badge variant="outline">Outline</Badge>
        </Row>
        <Row label="Uppercase">
          <Badge variant="green" uppercase>
            Betting Open
          </Badge>
          <Badge variant="indigo" uppercase>
            Round 1
          </Badge>
        </Row>
      </Section>

      {/* ------------------------------ INPUTS ------------------------------ */}
      <Section title="Input" subtitle="44px default, warm hairline, indigo focus ring, optional adornments.">
        <div className="grid max-w-md gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-email">Email</Label>
            <Input id="sg-email" type="email" placeholder="you@example.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>With adornments</Label>
            <Input leading={<span>$</span>} trailing={<span>.00</span>} placeholder="0" inputMode="numeric" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Invalid</Label>
            <Input aria-invalid placeholder="Something's off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Disabled</Label>
            <Input disabled placeholder="Disabled" />
          </div>
        </div>
      </Section>

      {/* ------------------------------- CARDS ------------------------------ */}
      <Section title="Card" subtitle="Warm hairline + soft shadow. Elevated lifts it; accent adds the gold hazard topper.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Default</CardTitle>
              <CardDescription>Soft shadow, 14px radius.</CardDescription>
            </CardHeader>
          </Card>
          <Card elevated>
            <CardHeader>
              <CardTitle>Elevated</CardTitle>
              <CardDescription>Lifted with shadow-md.</CardDescription>
            </CardHeader>
          </Card>
          <Card accent>
            <CardHeader>
              <CardTitle>Accent</CardTitle>
              <CardDescription>Gold hazard-stripe topper.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Section>

      {/* --------------------------- BETTING TOKENS ------------------------- */}
      <Section title="OddsChip" subtitle="American odds. Positive reads green, negative reads ink. Fractional + implied are sheet-supplied strings, shown verbatim.">
        <Row label="Polarity / size">
          <OddsChip odds={150} size="sm" />
          <OddsChip odds={150} />
          <OddsChip odds={150} size="lg" />
          <OddsChip odds={-130} />
          <OddsChip odds={-200} size="lg" />
        </Row>
        <Row label="Detail">
          <OddsChip odds={150} fractional="3/2" probability="40.0%" />
          <OddsChip odds={-130} fractional="10/13" probability="56.5%" />
        </Row>
      </Section>

      <Section title="MoneyDisplay" subtitle="Whole dollars for stakes, cents for payouts. P/L colors the sign.">
        <Row label="Plain / cents">
          <MoneyDisplay value={40} />
          <MoneyDisplay value={21.87} cents size="lg" />
        </Row>
        <Row label="Profit / loss">
          <MoneyDisplay value={26.31} cents pl />
          <MoneyDisplay value={-13.5} cents pl />
          <MoneyDisplay value={0} pl />
        </Row>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-inverse p-4">
          <span className="text-xs font-semibold text-gold-300 uppercase">
            on dark
          </span>
          <MoneyDisplay value={26.31} cents pl onDark />
          <MoneyDisplay value={-13.5} cents pl onDark />
        </div>
      </Section>

      <Section title="OutcomeBadge & StatusBadge" subtitle="Color always paired with a glyph or dot + label.">
        <Row label="Outcome">
          <OutcomeBadge outcome="hit" />
          <OutcomeBadge outcome="miss" />
          <OutcomeBadge outcome="push" />
          <OutcomeBadge outcome="void" />
        </Row>
        <Row label="Status">
          <StatusBadge status="open" />
          <StatusBadge status="closed" />
          <StatusBadge status="resolved" />
        </Row>
      </Section>

      <Section title="StakeInput" subtitle="Whole-dollar inline stake. Gold flash on placement; error state on invalid.">
        <Row label="Interactive">
          <StakeInput
            value={stake}
            placed={placed}
            onChange={(v) => {
              setStake(v)
              setPlaced(false)
            }}
            onPlace={() => setPlaced(true)}
          />
          <StakeInput value="25" error="Over your $20 max" />
          <StakeInput value="10" disabled />
        </Row>
      </Section>

      {/* ------------------------------ PICK ROW ---------------------------- */}
      <Section title="PickRow" subtitle="The workhorse row: a pick inside a bet card. Odds display values come verbatim from the sheet; the result badge appears only once a result is in.">
        <Card className="overflow-hidden p-0">
          <PickRow
            label="Dan Mercer"
            americanOdds={110}
            fractionalOdds="11/10"
            probability="47.6%"
          />
          <PickRow
            label="Steve Jones (-5)"
            americanOdds={-120}
            fractionalOdds="5/6"
            probability="54.5%"
          />
          <PickRow
            label="Garrett Klenke"
            americanOdds={200}
            fractionalOdds="2/1"
            probability="33.3%"
            result="hit"
          />
          <PickRow
            label="Field"
            americanOdds={-150}
            fractionalOdds="2/3"
            probability="60.0%"
            result="miss"
          />
        </Card>
      </Section>

      {/* ------------------------------ MODULES ----------------------------- */}
      <Section title="StatCard" subtitle="Glanceable label + big number. Feature gets the indigo treatment.">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Pool Total" value={960} money feature caption="24 players in" />
          <StatCard label="Your Entry" value={40} money />
          <StatCard label="Payout So Far" value={26.31} money cents caption="Theoretical" />
        </div>
      </Section>

      <Section title="BudgetModule" subtitle="Wagered vs entry, with a per-phase pick-count line.">
        <div className="grid gap-6 sm:grid-cols-3">
          <Card>
            <CardContent>
              <BudgetModule wagered={23} entryFee={40} picksLine="Phase 1: 3 picks" />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <BudgetModule
                wagered={40}
                entryFee={40}
                picksLine="Phase 1: 6 picks"
                balanced
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <BudgetModule
                wagered={52}
                entryFee={40}
                picksLine="Phase 1: 5 picks · Phase 2: 2 picks"
              />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="ComplianceBanner" subtitle="Firm but friendly. Informs without nagging; never blocks browsing.">
        <div className="flex flex-col gap-3">
          <ComplianceBanner tone="warning" title="Not balanced yet">
            You&apos;ve wagered $23 of $40 across 3 bets. Add $17 and at least 2
            more bets before Round 1 closes.
          </ComplianceBanner>
          <ComplianceBanner tone="info" title="Betting closes when an admin closes it">
            No countdown, no pressure. Numbers speak for themselves.
          </ComplianceBanner>
          <ComplianceBanner tone="success" title="You're balanced">
            $40 of $40 across 6 bets. You&apos;re all set for Round 1.
          </ComplianceBanner>
        </div>
      </Section>

      <Section title="RulesCard & EmptyState">
        <div className="grid gap-4 sm:grid-cols-2">
          <RulesCard entryFee={40} maxSingle={20} maxSelf={10} minBets={5} maxBets={10} />
          <EmptyState
            title="No bets published yet"
            message="Round 2 opens Saturday morning. Check back then."
            action={<Button variant="secondary" size="sm">Refresh</Button>}
          />
        </div>
      </Section>
    </div>
  )
}
