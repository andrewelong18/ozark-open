"use client"

import * as React from "react"
import { Dialog as BaseDialog } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"

// The app's first modal primitive (Sprint 18). A thin brand-styled wrapper over
// Base UI's Dialog — same approach as components/ui/button.tsx wraps Base UI's
// Button. Base UI handles the portal, focus trap, scroll lock, Esc + outside
// dismiss, and keeps the element mounted through the exit animation so the
// close is as smooth as the open.
//
// Motion: a backdrop fade plus a fade + rise + scale on the panel, driven by
// Base UI's transition data attributes (data-starting-style /
// data-ending-style) — no keyframes. Deliberately ASYMMETRIC: it arrives on
// --dur-enter/--ease-entrance (Material 3's curve for content coming on
// screen) and leaves faster on --dur-exit/--ease-exit, so the close doesn't
// compete with whatever is underneath it.
//
// It used to fade and scale only, at --dur-slow, and read as a cross-fade
// rather than something arriving. The rise is what changes that.
//
// These used to read `duration-[--dur-slow] ease-[--ease-out]`, which is
// Tailwind v3 syntax for an implicit var(). v4 removed that shorthand in
// favour of `duration-(--dur-slow)`, so what actually shipped was
// `transition-duration: --dur-slow` — invalid, resolving to 0s. The dialog
// did not animate for two sprints. Now on the named `duration-slow` /
// `ease-out` utilities, which are backed by the tokens in globals.css and
// cannot silently degrade the same way.
//
// The exit is why the reduced-motion block in globals.css zeroes durations to
// 0.01ms rather than `none`: Base UI keeps this popup mounted until
// element.getAnimations() settles, and `none` means there is nothing to settle.

export const Dialog = BaseDialog.Root
export const DialogTrigger = BaseDialog.Trigger
export const DialogClose = BaseDialog.Close

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-2xl leading-tight text-text-strong",
        className
      )}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      data-slot="dialog-description"
      className={cn("text-sm text-text-muted", className)}
      {...props}
    />
  )
}

/**
 * The animated overlay + centered panel. Compose the dialog body as children.
 * `className` styles the panel (surface, max-width, padding overrides).
 */
export function DialogPopup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        data-slot="dialog-backdrop"
        className={cn(
          "fixed inset-0 z-50 bg-ink-950/45",
          // The backdrop leads on the way in and trails on the way out, so the
          // panel never arrives over bare page or leaves against a hard cut.
          "transition-opacity duration-enter ease-entrance",
          "data-[ending-style]:duration-exit data-[ending-style]:ease-exit",
          "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
        )}
      />
      <BaseDialog.Popup
        data-slot="dialog-popup"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden",
          "rounded-2xl border border-border bg-surface-card shadow-[var(--shadow-lg)]",
          // Rises as it scales up, which is what makes it read as motion IN
          // rather than a cross-fade. --ease-entrance is Material 3's curve for
          // content arriving on screen; the exit is faster and accelerates away
          // so it doesn't compete with whatever is underneath.
          //
          // Scales from 96%, never from a small value — animating up from
          // scale(0) or even 0.8 reads as a cartoon zoom rather than a panel
          // settling into place.
          // The rise is written as an explicit `translate` rather than
          // `translate-y-2`, because this element is centred with
          // `-translate-x-1/2 -translate-y-1/2` and Tailwind's translate
          // utilities all write the same `translate` property — a y-only
          // utility would overwrite the centring and drop the panel half its
          // own height down the screen. calc() keeps the -50% and adds to it.
          "transition-[opacity,scale,translate] duration-enter ease-entrance",
          "data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[starting-style]:[translate:-50%_calc(-50%_+_10px)]",
          "data-[ending-style]:duration-exit data-[ending-style]:ease-exit",
          "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:[translate:-50%_calc(-50%_+_4px)]",
          className
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  )
}
