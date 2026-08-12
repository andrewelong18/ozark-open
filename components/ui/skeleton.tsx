import { cn } from "@/lib/utils"

/**
 * A loading placeholder — shadcn's Skeleton, on this system's tokens.
 *
 * `animate-pulse` is the one infinite animation the design system allows, and
 * only here. The rule it bends ("no infinite loops") exists to stop motion
 * competing for attention; a skeleton's whole job is to hold attention on a
 * region that is about to become real, and a static grey block reads as a
 * broken layout rather than a pending one. It also stops the moment the content
 * arrives, so it is bounded in practice even though the keyframes are not.
 *
 * Deliberately NOT a shimmer sweep: that needs a moving gradient, and the
 * system has no gradients (readme § Backgrounds — flat warm cream, depth from
 * shadow, nothing that reads as glare in sunlight).
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-surface-sunken",
        className
      )}
      {...props}
    />
  )
}

/**
 * The shared shape of a route-level loading state: a heading block over a card
 * of rows. Matching the real layout's rhythm is the point — a placeholder with
 * different proportions makes the swap read as a jump.
 */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-col gap-0 rounded-xl border border-border bg-surface-card p-0">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}
