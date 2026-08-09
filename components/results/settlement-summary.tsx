"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

// The copyable settlement summary on /results — the last mile of the product.
//
// The text itself is built server-side by lib/settlement.ts. This component
// decides nothing: it renders the string and copies it. Every caveat that
// matters (provisional splits, void refunds, unscored wagers) lives INSIDE the
// string, because the string is what gets pasted and the page around it isn't.
//
// The copy interaction is lifted verbatim from close-console.tsx's chase line
// rather than reinvented — same clipboard call, same 1500ms "Copied", same
// 44px-on-a-phone sizing. Two different copy behaviours in one app is the kind
// of small inconsistency nobody files a bug about and everybody notices.

// Pressed on a phone, at night, at the end of the weekend. See close-console.
const TOUCH = "h-11 sm:h-9"

export function SettlementSummary({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <span className="text-sm font-semibold text-text-strong">
            Send the payouts
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">
            The whole table as text — paste it into the group thread. Venmo
            happens off this.
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className={TOUCH}
          onClick={() => {
            void navigator.clipboard?.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {/*
        Shown, not hidden behind the button. An admin is about to send this to
        ~32 people and should be able to read exactly what they're sending —
        especially when it carries a PROVISIONAL warning.

        `whitespace-pre-wrap` keeps the line breaks the builder chose while
        still wrapping long names on a phone. It is NOT monospaced on purpose:
        the destination is a group text in a proportional font, so previewing
        it in one is the honest preview.
      */}
      <div className="px-4 py-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-body">
          {text}
        </p>
      </div>
    </Card>
  )
}
