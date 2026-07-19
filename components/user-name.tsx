import { cn } from "@/lib/utils"

// A member's name wherever it renders. The nickname sits right next to the
// full name in quotes — same color, only a touch smaller/lighter, never a
// muted subtext (Sprint 15). No nickname → just the name.
export function UserName({
  displayName,
  nickname,
  className,
  nicknameClassName,
}: {
  displayName: string
  nickname?: string | null
  className?: string
  nicknameClassName?: string
}) {
  return (
    <span className={className}>
      {displayName}
      {nickname ? (
        <span
          className={cn(
            "ml-1.5 text-[0.85em] font-medium text-current",
            nicknameClassName
          )}
        >
          &ldquo;{nickname}&rdquo;
        </span>
      ) : null}
    </span>
  )
}
