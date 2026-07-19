import { cn } from "@/lib/utils"

// Round profile picture. Renders the uploaded image when present, otherwise a
// branded gold placeholder with the member's initials — so every name in the
// app can carry a face without every member having uploaded one (Sprint 15).

const sizeClasses = {
  sm: "size-8 text-[11px]",
  md: "size-10 text-sm",
  lg: "size-24 text-3xl",
} as const

/** First + last initial (or the first two letters of a single-word name). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null
  name: string
  size?: keyof typeof sizeClasses
  className?: string
}) {
  const base = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    sizeClasses[size],
    className
  )

  if (src) {
    // Plain <img>: avatars are small, public, and served straight from Supabase
    // Storage — no next/image remote-host config needed.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn(base, "object-cover")} />
  }

  return (
    <span
      aria-hidden
      className={cn(
        base,
        "bg-accent-gold font-heading font-semibold text-accent-gold-foreground ring-1 ring-black/10 ring-inset"
      )}
    >
      {initials(name)}
    </span>
  )
}
