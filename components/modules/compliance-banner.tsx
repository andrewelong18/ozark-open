import { cn } from "@/lib/utils"

export type ComplianceTone = "warning" | "info" | "success"

const TONES: Record<
  ComplianceTone,
  { glyph: string; wrap: string; badge: string; title: string }
> = {
  warning: {
    glyph: "!",
    wrap: "border-caution-border bg-caution-surface",
    badge: "bg-caution-strong",
    title: "text-caution-strong",
  },
  info: {
    glyph: "i",
    wrap: "border-indigo-100 bg-indigo-50",
    badge: "bg-indigo-700",
    title: "text-indigo-700",
  },
  success: {
    glyph: "✓",
    wrap: "border-win-border bg-win-surface",
    badge: "bg-win-strong",
    title: "text-win-strong",
  },
}

export type ComplianceBannerProps = {
  tone?: ComplianceTone
  title?: string
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}

/**
 * Compliance banner — "You've wagered $23 of $40…". Firm but friendly; informs
 * without nagging and never blocks browsing.
 */
export function ComplianceBanner({
  tone = "warning",
  title,
  children,
  action,
  className,
}: ComplianceBannerProps) {
  const t = TONES[tone] ?? TONES.warning
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3.5 py-3",
        t.wrap,
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[13px] leading-none font-bold text-white",
          t.badge
        )}
      >
        {t.glyph}
      </span>
      <div className="min-w-0 flex-1">
        {title && (
          <div className={cn("mb-0.5 text-sm font-bold", t.title)}>{title}</div>
        )}
        <div className="text-sm leading-normal text-text-body">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
