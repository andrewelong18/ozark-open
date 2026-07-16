import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Generic pill badge with the DS tone set. Prefer the semantic
// StatusBadge / OutcomeBadge for bet lifecycle + outcome states.
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        solid: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-neutral-border bg-neutral-surface text-ink-700",
        neutral: "border-neutral-border bg-neutral-surface text-ink-700",
        outline: "border-border text-foreground",
        indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
        gold: "border-gold-200 bg-gold-100 text-gold-700",
        green: "border-win-border bg-win-surface text-win-strong",
        red: "border-loss-border bg-loss-surface text-loss-strong",
        destructive: "border-loss-border bg-loss-surface text-loss-strong",
        amber: "border-caution-border bg-caution-surface text-caution-strong",
      },
      uppercase: {
        true: "uppercase tracking-wide",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      uppercase: false,
    },
  }
)

function Badge({
  className,
  variant = "default",
  uppercase = false,
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, uppercase }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
