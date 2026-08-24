"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar } from "@/components/avatar"
import { UserName } from "@/components/user-name"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ProfileForm } from "@/components/profile/profile-form"

// Self-serve profile, reorganized into tabbed sub-navigation (Your status ·
// Personalize · Admin). The server page fetches everything and passes it in;
// this component owns the tab state and pins Log out to the bottom of every
// sub-page. Mirrors the clubhouse pill nav (components/site-nav) so the
// second-level nav reads as part of the same system.
//
// "How it works" came out Aug 23, 2026: it restated the dashboard's own
// walkthrough — same four cards from the same howItWorksCards() — one tab away
// from a page nobody opens to read the rules. The dashboard accordion is the
// one copy now.

type Tab = "status" | "personalize" | "admin"

function toTab(value: string | undefined, isAdmin: boolean): Tab {
  if (value === "personalize") return "personalize"
  // Guarded: ?tab=admin from a non-admin must not render the admin menu.
  if (value === "admin" && isAdmin) return "admin"
  return "status"
}

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
  initialTab,
}: {
  userId: string
  displayName: string
  email: string
  nickname: string | null
  avatarUrl: string | null
  isAdmin: boolean
  status: StatusModel
  /** ?tab= from the server — how an admin page returns to the Admin menu. */
  initialTab?: string
}) {
  const [tab, setTab] = useState<Tab>(() => toTab(initialTab, isAdmin))
  const activeRef = useRef<HTMLButtonElement | null>(null)

  // Same rail, same fix as components/site-nav: an admin's four tabs overflow a
  // phone, and tapping "Admin" scrolled the panel below without ever bringing
  // the chosen tab into view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [tab])

  const tabs: { id: Tab; label: string }[] = [
    { id: "status", label: "Your status" },
    { id: "personalize", label: "Personalize" },
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
              ref={active ? activeRef : undefined}
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "h-11 shrink-0 rounded-full px-4 text-sm whitespace-nowrap transition-colors duration-fast ease-standard",
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
        {tab === "admin" && isAdmin && <AdminPanel />}
      </div>

      {/* Log out — pinned to the bottom of every sub-page. */}
      <form method="POST" action="/auth/signout" className="mt-auto pt-4">
        <Button variant="destructive" type="submit" className="w-full">
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

// Five pages, clean boundaries: people · menu · money · the clock · the
// rulebook. Sprint 20 merged the old Participants and Roster buttons into
// People; Sprint 25 added Close & Settle, the only one that matters on a
// deadline; Sprint 23 added House Rules, the only one you should rarely need.
//
// Labels renamed Aug 23, 2026 to say what the page does rather than what it
// is: "People" and "View All" told an admin standing in the clubhouse on
// tournament night nothing about which one to tap. The page headings keep
// their short names.
const ADMIN_PAGES: { href: string; label: string; blurb: string }[] = [
  {
    href: "/admin/people",
    label: "Manage Users and Entry Fees",
    blurb: "Approve members, set entry fees, edit names, invite the rest.",
  },
  {
    href: "/admin/import",
    label: "Import Bets",
    blurb: "Upload the spreadsheet to publish or update the menu.",
  },
  {
    href: "/admin/view",
    label: "Review All Bets",
    blurb: "Every wager in the pool, the View sheet as the app sees it.",
  },
  {
    href: "/admin/close",
    label: "Close & Settle",
    blurb: "Close a phase, publish results, settle the pool.",
  },
  {
    href: "/admin/rules",
    label: "Manage House Rules",
    blurb: "Entry-fee bounds, bet caps and pick counts for this tournament.",
  },
]

function AdminPanel() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-muted">
        You&apos;re an admin. Manage the pool from here.
      </p>
      {/* A list of destinations, not a toolbar: these are five separate pages,
          and a row per page — full width, tap-sized, chevroned — says that in a
          way a wrap of small buttons never did. */}
      <nav className="flex flex-col gap-2">
        {ADMIN_PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="group flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-surface-card px-4 py-3 shadow-sm transition-colors duration-fast ease-standard hover:border-indigo-200 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="min-w-0">
              <span className="block font-heading text-lg text-text-strong">
                {page.label}
              </span>
              <span className="mt-0.5 block text-sm text-text-muted">
                {page.blurb}
              </span>
            </span>
            <ChevronRight
              aria-hidden
              className="size-5 shrink-0 text-text-muted transition-transform duration-fast ease-standard group-hover:translate-x-0.5"
            />
          </Link>
        ))}
      </nav>
    </div>
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
