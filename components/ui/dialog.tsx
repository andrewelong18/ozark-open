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
// Motion: a soft backdrop fade plus a fade + zoom-95 on the panel, both on the
// design system's --dur-slow / --ease-out. Driven by Base UI's transition data
// attributes (data-starting-style / data-ending-style) — no keyframes, fully
// symmetric in and out. Kept subtle per the DS ("confirmation-only" motion).

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
          "transition-opacity duration-[--dur-slow] ease-[--ease-out]",
          "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
        )}
      />
      <BaseDialog.Popup
        data-slot="dialog-popup"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden",
          "rounded-2xl border border-border bg-surface-card shadow-[var(--shadow-lg)]",
          "transition-[opacity,transform] duration-[--dur-slow] ease-[--ease-out]",
          "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
          "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
          className
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  )
}
