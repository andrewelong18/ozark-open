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
          // 44px tall and wider on a phone so the ↵ below can be a real target
          // without squeezing the digits; back to the compact desktop control
          // at sm+, where the pointer is a mouse.
          "flex h-12 w-[132px] items-center rounded-lg border-[1.5px] pr-1 pl-2.5 transition-[border-color,box-shadow] sm:h-10 sm:w-[108px]",
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
          // h-full, not the input's intrinsic ~21px line box: without it the
          // digits are a 21px-tall target sitting inside a 48px control, and a
          // tap anywhere else in the field lands on the wrapper and focuses
          // nothing. The border is drawn by the wrapper either way.
          className="tabular h-full min-w-0 flex-1 border-none bg-transparent text-left font-semibold text-text-body outline-none"
        />
        <button
          type="button"
          onClick={() => onPlace?.()}
          disabled={disabled || !value}
          aria-label="Place stake"
          className={cn(
            // The button that commits a wager. 30px was the smallest target on
            // the busiest screen; it's the full height of the field now, and a
            // real 44 wide on a phone. sm+ keeps the old square.
            "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-[15px] leading-none font-bold transition-colors sm:size-[30px]",
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
      {/* The error message itself is surfaced by the menu's floating toast so
          the input never reflows — here `error` only reddens the border above. */}
      {!error && placed && (
        <span className="text-[11px] font-semibold text-win-strong">
          Bet placed
        </span>
      )}
    </div>
  )
}
