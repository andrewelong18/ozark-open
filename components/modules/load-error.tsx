import { cn } from "@/lib/utils"

export type LoadErrorProps = {
  /** What couldn't be loaded, in the member's words: "your wagers", "the
   *  betting menu". Rendered as "We couldn't load {subject}." */
  subject: string
  className?: string
}

/**
 * "We couldn't load this" — deliberately NOT an EmptyState (#132).
 *
 * Sprint 23 added a second FK from bet_placements to users, which made an
 * unqualified embed ambiguous; PostgREST rejected the whole request, the
 * dropped error left `data` null, `?? []` turned that into an empty array, and
 * every closed bet on the weekend's big reveal read "No wagers on this bet".
 * It looked exactly like nobody had bet. Nobody noticed for two sprints.
 *
 * So the visual difference is the point, not decoration: a member must be able
 * to tell "nobody bet" from "we couldn't tell you". Warning colours and a
 * solid border, against EmptyState's quiet dashed one.
 */
export function LoadError({ subject, className }: LoadErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-6 py-10 text-center",
        className
      )}
    >
      <div
        aria-hidden
        className="flex size-13 items-center justify-center rounded-full bg-amber-100 text-2xl"
      >
        ⚠️
      </div>
      <div className="font-heading text-xl text-amber-900">
        We couldn&rsquo;t load {subject}
      </div>
      <div className="max-w-xs text-sm leading-normal text-amber-800">
        Something went wrong on our end — this is not the same as there being
        nothing here. Refresh to try again, and tell an admin if it keeps
        happening.
      </div>
    </div>
  )
}
