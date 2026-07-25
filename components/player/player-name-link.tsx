"use client"

import { usePlayerProfileModal } from "@/components/player/player-profile-provider"
import { Avatar } from "@/components/avatar"
import { cn } from "@/lib/utils"

// A golfer's name rendered as a profile-modal link with a super-tiny trailing
// avatar (Sprint 19). Used for the player names in bet-pick labels: the name
// truncates while the avatar stays pinned and always visible, and tapping
// either one opens the shared profile modal. Unlike PlayerChip (avatar-first,
// name inside the truncating span), this keeps the icon safe from clipping and
// shows the label verbatim — stroke suffixes and all. The modal repaints from
// its own fetch by userId, so `label` is only the instant-paint fallback.

export function PlayerNameLink({
  userId,
  label,
  avatarUrl = null,
  className,
  nameClassName,
}: {
  userId: string
  /** Visible text — the sheet pick label, rendered verbatim. */
  label: string
  avatarUrl?: string | null
  className?: string
  nameClassName?: string
}) {
  const { open } = usePlayerProfileModal()
  return (
    <button
      type="button"
      onClick={() => open(userId, { displayName: label, avatarUrl })}
      className={cn(
        "inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md text-left",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      {/* Reads as normal UI text — same color and size — with only an
          underline to mark it as a link (decoration inherits the text color). */}
      <span className={cn("min-w-0 truncate underline underline-offset-2", nameClassName)}>
        {label}
      </span>
      <Avatar src={avatarUrl} name={label} size="xs" className="shrink-0" />
    </button>
  )
}
