import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Ozark Open button. Whole-height (>=44px default) touch targets for
// sunlight/mobile use; indigo primary with a rationed gold variant reserved
// for the single marquee action per screen.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px active:shadow-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs [a]:hover:bg-primary-hover hover:bg-primary-hover",
        gold: "bg-accent-gold text-accent-gold-foreground shadow-xs [a]:hover:bg-accent-gold-hover hover:bg-accent-gold-hover",
        secondary:
          "border-border-strong bg-surface-card text-primary shadow-xs hover:bg-surface-sunken",
        outline:
          "border-border bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "text-primary hover:bg-indigo-50",
        destructive:
          "border-loss-border bg-loss-surface text-loss-strong hover:bg-[var(--red-100)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 text-base has-[>svg]:px-4",
        sm: "h-9 px-3.5 text-sm has-[>svg]:px-3",
        lg: "h-13 px-7 text-lg has-[>svg]:px-6",
        icon: "size-11",
        "icon-sm": "size-9",
        "icon-lg": "size-13",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
