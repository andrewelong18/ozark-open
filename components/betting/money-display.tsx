import { cn } from "@/lib/utils"
import { formatMoneyAmount } from "@/lib/money"

type MoneySize = "xs" | "sm" | "md" | "lg" | "xl"
type MoneyWeight = "regular" | "medium" | "semibold" | "bold"

const sizeClass: Record<MoneySize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-3xl",
}

const weightClass: Record<MoneyWeight, string> = {
  regular: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
}

export type MoneyDisplayProps = {
  value: number
  /** Show cents (computed payouts) vs whole dollars (stakes/entries). */
  cents?: boolean
  /** Color + explicit sign the value as profit/loss (green up / red down). */
  pl?: boolean
  /** Switch P/L colors to their accessible light variants on dark surfaces. */
  onDark?: boolean
  size?: MoneySize
  weight?: MoneyWeight
  className?: string
}

/**
 * Consistent money treatment with tabular figures so columns align. `pl`
 * colors the sign; otherwise the value inherits its surrounding color.
 */
export function MoneyDisplay({
  value,
  cents = false,
  pl = false,
  onDark = false,
  size = "md",
  weight = "bold",
  className,
}: MoneyDisplayProps) {
  const negative = value < 0
  const sign = pl ? (negative ? "−" : value > 0 ? "+" : "") : negative ? "−" : ""

  const plColor = pl
    ? negative
      ? onDark
        ? "text-money-down-on-dark"
        : "text-money-down"
      : value > 0
        ? onDark
          ? "text-money-up-on-dark"
          : "text-money-up"
        : onDark
          ? "text-indigo-200"
          : "text-money-flat"
    : ""

  return (
    <span
      className={cn(
        "tabular whitespace-nowrap tracking-[0.01em]",
        sizeClass[size],
        weightClass[weight],
        plColor,
        className
      )}
    >
      {sign}${formatMoneyAmount(value, cents)}
    </span>
  )
}
