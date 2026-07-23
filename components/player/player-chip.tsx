"use client"

import { usePlayerProfileModal } from "@/components/player/player-profile-provider"
import { Avatar } from "@/components/avatar"
import { UserName } from "@/components/user-name"
import { cn } from "@/lib/utils"

// A member's name, made clickable (Sprint 18). Drop-in for the inline
// Avatar + UserName clusters: renders the same face + name but as a button that
// opens the shared profile modal, with a subtle hover underline. The `fallback`
// it passes lets the modal header paint instantly before its own fetch lands.

export function PlayerChip({
  userId,
  displayName,
  nickname = null,
  avatarUrl = null,
  size = "sm",
  hideAvatar = false,
  tone = "default",
  className,
  nameClassName,
  nicknameClassName,
  children,
}: {
  userId: string
  displayName: string
  nickname?: string | null
  avatarUrl?: string | null
  size?: "sm" | "md" | "lg"
  /** Render only the name as the trigger (avatar shown separately by caller). */
  hideAvatar?: boolean
  /** `onDark` tunes the hover underline for use on the indigo surface. */
  tone?: "default" | "onDark"
  className?: string
  nameClassName?: string
  nicknameClassName?: string
  /** Inline content after the name (e.g. a "($5 refunded)" suffix). */
  children?: React.ReactNode
}) {
  const { open } = usePlayerProfileModal()
  return (
    <button
      type="button"
      onClick={() => open(userId, { displayName, nickname, avatarUrl })}
      className={cn(
        "group/chip inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-md text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      {!hideAvatar && <Avatar src={avatarUrl} name={displayName} size={size} />}
      <span className={cn("min-w-0 truncate", nameClassName)}>
        <UserName
          displayName={displayName}
          nickname={nickname}
          nicknameClassName={nicknameClassName}
          className={cn(
            "underline-offset-2 group-hover/chip:underline",
            tone === "onDark" ? "decoration-white/50" : "decoration-indigo-300"
          )}
        />
        {children}
      </span>
    </button>
  )
}
