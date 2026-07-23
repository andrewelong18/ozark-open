"use client"

import { useEffect, useState } from "react"
import { CalendarDays, MapPin, X } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import {
  normalizeProfileRow,
  type PlayerProfile,
  type ProfileQueryRow,
} from "@/lib/player-profile"
import { Avatar } from "@/components/avatar"
import { UserName } from "@/components/user-name"
import { DialogClose, DialogTitle } from "@/components/ui/dialog"
import { PlayerStatsChart } from "@/components/player/player-stats-chart"

// The profile modal body (Sprint 18). Rendered inside the shared Dialog by
// PlayerProfileProvider. Fetches the member's profile lazily on open (users is
// readable by every authenticated user — users_read_all RLS), painting the
// header instantly from the `fallback` the clicked name already had, then
// filling the rest when the row arrives. All content is dummy for now, seeded
// in the migration and editable in Studio.

export type PlayerFallback = {
  displayName: string
  nickname?: string | null
  avatarUrl?: string | null
}

const PROFILE_COLUMNS =
  "display_name, nickname, avatar_url, bio, hometown, member_since, strength, weakness, past_performance"

export function PlayerProfileModal({
  userId,
  fallback,
}: {
  userId: string
  fallback?: PlayerFallback
}) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Runs once per member — the modal is remounted (keyed by userId) on open,
    // so `loading` starts true and never needs resetting here.
    let active = true
    const supabase = createClient()
    supabase
      .from("users")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        setProfile(normalizeProfileRow(data as ProfileQueryRow | null, userId))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId])

  // Header identity paints immediately from the fallback, upgrades on fetch.
  const displayName = profile?.display_name ?? fallback?.displayName ?? "Member"
  const nickname = profile?.nickname ?? fallback?.nickname ?? null
  const avatarUrl = profile?.avatar_url ?? fallback?.avatarUrl ?? null

  return (
    <PlayerProfileView
      displayName={displayName}
      nickname={nickname}
      avatarUrl={avatarUrl}
      profile={profile}
      loading={loading}
    />
  )
}

/**
 * The presentational profile modal — header + body — given already-resolved
 * identity and a (possibly still-loading) profile. Split out from the fetching
 * container so it renders from static data too (the /style-guide-style preview
 * used for design review). Must be rendered inside a <Dialog> (uses DialogTitle
 * / DialogClose).
 */
export function PlayerProfileView({
  displayName,
  nickname,
  avatarUrl,
  profile,
  loading,
}: {
  displayName: string
  nickname: string | null
  avatarUrl: string | null
  profile: PlayerProfile | null
  loading: boolean
}) {
  return (
    <div className="flex max-h-[inherit] flex-col">
      {/* Feature header — the one bold brand moment, echoing the results
          winner spotlight: large avatar + name on indigo. */}
      <div className="relative flex items-center gap-4 bg-surface-inverse px-6 py-6 text-white">
        <Avatar
          src={avatarUrl}
          name={displayName}
          size="lg"
          className="size-16 text-2xl shadow-md ring-2 ring-white/20 sm:size-24 sm:text-3xl"
        />
        <div className="min-w-0 flex-1">
          <DialogTitle className="pr-6 text-white">
            <UserName
              displayName={displayName}
              nickname={nickname}
              nicknameClassName="text-gold-300"
            />
          </DialogTitle>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-indigo-100">
            {profile?.hometown && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {profile.hometown}
              </span>
            )}
            {profile?.member_since != null && (
              <span className="tabular inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden />
                Member since {profile.member_since}
              </span>
            )}
          </div>
        </div>
        <DialogClose
          aria-label="Close"
          className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        >
          <X className="size-4.5" aria-hidden />
        </DialogClose>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
        {/* Strength / weakness — paired label + color, never color alone. */}
        <div className="grid grid-cols-2 gap-3">
          <ScoutCard
            label="Strength"
            tone="win"
            value={profile?.strength}
            loading={loading}
          />
          <ScoutCard
            label="Weakness"
            tone="loss"
            value={profile?.weakness}
            loading={loading}
          />
        </div>

        {/* Bio */}
        <section>
          <SectionLabel>Profile</SectionLabel>
          {loading ? (
            <SkeletonLines />
          ) : (
            <p className="text-sm leading-relaxed text-text-body">
              {profile?.bio ?? "No bio yet."}
            </p>
          )}
        </section>

        {/* 4-year stats chart */}
        <section>
          <SectionLabel>Last 4 Ozark Opens</SectionLabel>
          {loading || !profile ? (
            <div className="h-32 animate-pulse rounded-xl bg-surface-sunken" />
          ) : (
            <PlayerStatsChart data={profile.past_performance} />
          )}
        </section>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-bold tracking-wider text-text-muted uppercase">
      {children}
    </div>
  )
}

function ScoutCard({
  label,
  tone,
  value,
  loading,
}: {
  label: string
  tone: "win" | "loss"
  value: string | null | undefined
  loading: boolean
}) {
  const toneClasses =
    tone === "win"
      ? "border-win-border bg-win-surface"
      : "border-loss-border bg-loss-surface"
  const labelClasses = tone === "win" ? "text-win-strong" : "text-loss-strong"
  return (
    <div className={`rounded-xl border p-3 ${toneClasses}`}>
      <div
        className={`text-[11px] font-bold tracking-wider uppercase ${labelClasses}`}
      >
        {label}
      </div>
      {loading ? (
        <div className="mt-1.5 h-4 w-3/4 animate-pulse rounded bg-black/5" />
      ) : (
        <p className="mt-1 text-sm leading-snug text-text-body">
          {value ?? "—"}
        </p>
      )}
    </div>
  )
}

function SkeletonLines() {
  return (
    <div className="space-y-2">
      <div className="h-3.5 w-full animate-pulse rounded bg-surface-sunken" />
      <div className="h-3.5 w-11/12 animate-pulse rounded bg-surface-sunken" />
      <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface-sunken" />
    </div>
  )
}
