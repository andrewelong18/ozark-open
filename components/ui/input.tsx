import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

const sizeClasses = {
  sm: "h-9 text-sm",
  md: "h-11 text-base",
  lg: "h-13 text-base",
} as const

// Text / email / number input tuned for the sportsbook. 44px tall by default,
// warm hairline border, indigo focus ring. Optional leading/trailing
// adornments wrap the field; without them it renders a bare styled input.
function Input({
  className,
  type,
  inputSize = "md",
  leading,
  trailing,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & {
  inputSize?: keyof typeof sizeClasses
  leading?: React.ReactNode
  trailing?: React.ReactNode
}) {
  const field = (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 bg-transparent text-text-body outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        leading || trailing
          ? "h-full"
          : cn(
              "rounded-lg border border-input px-3 transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
              sizeClasses[inputSize]
            ),
        leading || trailing ? "" : className
      )}
      {...props}
    />
  )

  if (!leading && !trailing) return field

  return (
    <div
      data-slot="input-wrapper"
      className={cn(
        "flex items-center gap-2 rounded-lg border border-input bg-surface-card px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[input:disabled]:opacity-60 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20",
        sizeClasses[inputSize],
        className
      )}
    >
      {leading && (
        <span className="inline-flex shrink-0 text-muted-foreground">
          {leading}
        </span>
      )}
      {field}
      {trailing && (
        <span className="inline-flex shrink-0 text-muted-foreground">
          {trailing}
        </span>
      )}
    </div>
  )
}

export { Input }
