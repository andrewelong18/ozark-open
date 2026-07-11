"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export type StakeInputProps = {
  value?: string
  placed?: boolean
  error?: string | null
  disabled?: boolean
  onChange?: (digits: string) => void
  onPlace?: () => void
  className?: string
}

/**
 * Inline whole-dollar stake input for an open bet row. States: unplaced
 * (empty), placed (confirmed — gold flash), error (over max / invalid).
 * Whole dollars only. `onPlace` fires on Enter or the check button.
 */
export function StakeInput({
  value = "",
  placed = false,
  error = null,
  disabled = false,
  onChange,
  onPlace,
  className,
}: StakeInputProps) {
  const [focus, setFocus] = React.useState(false)

  const borderColor = error
    ? "border-loss"
    : placed
      ? "border-win"
      : focus
        ? "border-ring"
        : "border-border-strong"

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value.replace(/[^0-9]/g, ""))
  }

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <div
        className={cn(
          "flex h-10 w-[108px] items-center rounded-lg border-[1.5px] pr-1 pl-2.5 transition-[border-color,box-shadow]",
          borderColor,
          disabled ? "bg-surface-sunken opacity-60" : "bg-surface-card",
          // Gold ring flashes once each time `placed` flips true; the class is
          // removed on edit and re-added on the next placement, replaying it.
          placed
            ? "animate-stake-flash"
            : focus
              ? "shadow-[var(--shadow-focus)]"
              : "shadow-none"
        )}
      >
        <span
          className={cn(
            "font-semibold tabular",
            value ? "text-text-body" : "text-text-muted"
          )}
        >
          $
        </span>
        <input
          inputMode="numeric"
          value={value}
          placeholder="0"
          disabled={disabled}
          onChange={handle}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onPlace?.()
          }}
          className="tabular min-w-0 flex-1 border-none bg-transparent text-left font-semibold text-text-body outline-none"
        />
        <button
          type="button"
          onClick={() => onPlace?.()}
          disabled={disabled || !value}
          aria-label="Place stake"
          className={cn(
            "inline-flex size-[30px] shrink-0 items-center justify-center rounded-md text-[15px] leading-none font-bold transition-colors",
            placed
              ? "bg-win text-white"
              : value
                ? "bg-primary text-white"
                : "bg-surface-sunken text-text-muted",
            disabled || !value ? "cursor-default" : "cursor-pointer"
          )}
        >
          {placed ? "✓" : "↵"}
        </button>
      </div>
      {error && (
        <span className="text-[11px] font-medium text-loss">{error}</span>
      )}
      {!error && placed && (
        <span className="text-[11px] font-semibold text-win-strong">
          Bet placed
        </span>
      )}
    </div>
  )
}
