"use client"

import { useState } from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { Avatar } from "@/components/avatar"
import { UserName } from "@/components/user-name"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ProfileForm } from "@/components/profile/profile-form"
import { howItWorksCards } from "@/components/onboarding/how-it-works"

// Self-serve profile, reorganized into tabbed sub-navigation (Your status ·
// Personalize · How it works · Admin). The server page fetches everything and
// passes it in; this component owns the tab state and pins Log out to the
// bottom of every sub-page. Mirrors the clubhouse pill nav (components/site-nav)
// so the second-level nav reads as part of the same system.

type Tab = "status" | "personalize" | "how-it-works" | "admin"

type StatusModel = {
  isAdmin: boolean
  hasTournament: boolean
  participant: { entry_fee: number; is_player: boolean } | null
  readyToBet: boolean
}

export function ProfileTabs({
  userId,
  displayName,
  email,
  nickname,
  avatarUrl,
  isAdmin,
  status,
  minPicks,
  maxPicks,
}: {
  userId: string
  displayName: string
  email: string
  nickname: string | null
  avatarUrl: string | null
  isAdmin: boolean
  status: StatusModel
  minPicks: number
  maxPicks: number
}) {
  const [tab, setTab] = useState<Tab>("status")

  const tabs: { id: Tab; label: string }[] = [
    { id: "status", label: "Your status" },
    { id: "personalize", label: "Personalize" },
    { id: "how-it-works", label: "How it works" },
    ...(isAdmin ? [{ id: "admin" as const, label: "Admin" }] : []),
  ]

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-4">
      {/* Hero — the face + name people see everywhere else in the app. */}
      <div className="flex items-center gap-4">
        <Avatar src={avatarUrl} name={displayName} size="lg" />
        <div className="min-w-0">
          <h1 className="font-heading text-3xl leading-tight text-text-strong">
            <UserName displayName={displayName} nickname={nickname} />
          </h1>
          <p className="mt-0.5 truncate text-sm text-text-muted">{email}</p>
          <div className="mt-1.5">
            <Badge variant={isAdmin ? "gold" : "indigo"} uppercase>
              {isAdmin ? "Admin" : "Participant"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Sub-nav — the persistent second-level pill rail. On mobile it bleeds to
          the right screen edge under a fade so the horizontal scroll is
          discoverable; contained again once it fits (sm+). */}
      <nav className="scrollbar-none fade-right sm:fade-right-none -mr-4 flex gap-1 overflow-x-auto rounded-full rounded-r-none border border-r-0 border-border bg-surface-sunken p-1 sm:mr-0 sm:rounded-r-full sm:border-r">
        {tabs.map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-sm whitespace-nowrap transition-colors",
                active
                  ? "bg-accent-gold font-bold text-accent-gold-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_1px_3px_rgba(0,0,0,0.2)]"
                  : "font-medium text-text-muted hover:bg-surface-card hover:text-text-strong"
              )}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Active panel. */}
      <div className="flex flex-col gap-4">
        {tab === "status" && <StatusPanel status={status} />}
        {tab === "personalize" && (
          <ProfileForm
            userId={userId}
            displayName={displayName}
            initialNickname={nickname}
            initialAvatarUrl={avatarUrl}
          />
        )}
        {tab === "how-it-works" && (
          <HowItWorksPanel minPicks={minPicks} maxPicks={maxPicks} />
        )}
        {tab === "admin" && isAdmin && <AdminPanel />}
      </div>

      {/* Log out — pinned to the bottom of every sub-page. */}
      <form method="POST" action="/auth/signout" className="mt-auto pt-4">
        <Button variant="secondary" type="submit" className="w-full">
          Log out
        </Button>
      </form>
    </div>
  )
}

function StatusPanel({ status }: { status: StatusModel }) {
  const { isAdmin, hasTournament, participant, readyToBet } = status
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="font-heading text-lg text-text-strong">Your status</div>
        <StatusRow label="Role" value={isAdmin ? "Admin" : "Participant"} />
        <StatusRow
          label="Registration"
          value={
            !hasTournament
              ? "No tournament yet"
              : participant
                ? `Approved${participant.is_player ? "" : " (non-player)"}`
                : "Pending approval"
          }
          tone={participant ? "good" : "muted"}
        />
        <StatusRow
          label="Entry fee"
          value={participant ? `$${participant.entry_fee}` : "—"}
        />
        <StatusRow
          label="Ready to bet"
          value={
            !participant
              ? "An admin will approve you to bet soon"
              : readyToBet
                ? "Yes — the book is open"
                : "Approved — betting opens when the book does"
          }
          tone={readyToBet ? "good" : "muted"}
        />
      </CardContent>
    </Card>
  )
}

function HowItWorksPanel({
  minPicks,
  maxPicks,
}: {
  minPicks: number
  maxPicks: number
}) {
  const cards = howItWorksCards(minPicks, maxPicks)
  return (
    <div className="flex flex-col gap-3">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <Card key={c.title}>
            <CardContent className="flex gap-3.5">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-gold text-accent-gold-foreground">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="flex flex-col gap-1">
                <div className="font-heading text-lg text-text-strong">
                  {c.title}
                </div>
                <p className="text-sm leading-normal text-text-muted">
                  {c.body}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function AdminPanel() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="font-heading text-lg text-text-strong">Admin</div>
        <p className="text-sm text-text-muted">
          You&apos;re an admin. Manage the pool from here.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" render={<Link href="/admin/view" />}>
            View All
          </Button>
          <Button variant="secondary" size="sm" render={<Link href="/admin/import" />}>
            Import Bets
          </Button>
          <Button
            variant="secondary"
            size="sm"
            render={<Link href="/admin/participants" />}
          >
            Participants
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusRow({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "good" | "muted"
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span
        className={
          "text-right text-sm font-semibold " +
          (tone === "good"
            ? "text-win-strong"
            : tone === "muted"
              ? "text-text-muted"
              : "text-text-strong")
        }
      >
        {value}
      </span>
    </div>
  )
}
