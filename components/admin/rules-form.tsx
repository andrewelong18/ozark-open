"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  RULE_INT_FIELDS,
  RULE_LABELS,
  RULE_PCT_FIELDS,
  ruleLimitsPreview,
  validateTournamentRules,
} from "@/lib/rules"
import type { TournamentRules } from "@/lib/validation"

// The house-rules form (Sprint 23 / #100) — the client half of /admin/rules.
//
// The derived-limits table is the point. "50% of entry, capped at $20" doesn't
// tell you that a $25 entry allows $12 (the code floors) or that everything
// from $40 up allows exactly $20 (the cap binds). That table is what Pat
// reasons about, so it recomputes as he types, using lib/rules.ts's
// ruleLimitsPreview — which calls the SAME maxSingleBet/maxSelfBet the
// placement path enforces with, so it can't drift from reality.
//
// Client validation here is UX; /api/admin/rules re-runs the identical
// validateTournamentRules server-side.

/** Fields kept as strings while editing so a half-typed "0." doesn't snap. */
type Draft = Record<keyof TournamentRules, string>

function toDraft(rules: TournamentRules): Draft {
  return Object.fromEntries(
    Object.entries(rules).map(([k, v]) => [k, String(v)])
  ) as Draft
}

function toRules(draft: Draft): TournamentRules {
  return Object.fromEntries(
    Object.entries(draft).map(([k, v]) => [k, Number(v)])
  ) as unknown as TournamentRules
}

function RuleField({
  field,
  draft,
  setField,
  step,
  hint,
}: {
  field: keyof TournamentRules
  draft: Draft
  setField: (field: keyof TournamentRules, value: string) => void
  step?: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`rule-${field}`}>{RULE_LABELS[field]}</Label>
      <Input
        id={`rule-${field}`}
        type="number"
        inputMode="decimal"
        step={step ?? "1"}
        value={draft[field]}
        onChange={(e) => setField(field, e.target.value)}
        className="w-32"
      />
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
}

export function RulesForm({ rules }: { rules: TournamentRules }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(() => toDraft(rules))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const setField = (field: keyof TournamentRules, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }))
    setSaved(false)
  }

  const candidate = toRules(draft)
  const everyFieldNumeric = Object.values(candidate).every((v) =>
    Number.isFinite(v)
  )
  const localErrors = everyFieldNumeric
    ? validateTournamentRules(candidate)
    : ["Every rule needs a number."]
  const dirty = [...RULE_INT_FIELDS, ...RULE_PCT_FIELDS].some(
    (f) => Number(draft[f]) !== rules[f]
  )
  // Only preview limits we'd actually be willing to save — a preview built
  // from rejected values would be fiction.
  const preview = localErrors.length === 0 ? ruleLimitsPreview(candidate) : null

  async function save() {
    setBusy(true)
    setErrors([])
    const res = await fetch("/api/admin/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    })
    const json = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      setErrors(
        Array.isArray(json?.errors)
          ? json.errors
          : [json?.error ?? `Request failed (${res.status}).`]
      )
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="font-heading text-lg text-text-strong">Entry</div>
          <div className="flex flex-wrap gap-4">
            <RuleField field="entry_fee_min" draft={draft} setField={setField} />
            <RuleField field="entry_fee_max" draft={draft} setField={setField} />
          </div>

          <div className="border-t border-border pt-4 font-heading text-lg text-text-strong">
            Picks
          </div>
          <div className="flex flex-wrap gap-4">
            <RuleField
              field="min_picks_per_tournament"
              draft={draft}
              setField={setField}
              hint="Across both phases combined, due by Phase 2 close."
            />
            <RuleField
              field="max_picks_per_phase"
              draft={draft}
              setField={setField}
              hint="In any one phase. The maximum is per phase; the minimum isn't."
            />
          </div>

          <div className="border-t border-border pt-4 font-heading text-lg text-text-strong">
            Bet size
          </div>
          <div className="flex flex-wrap gap-4">
            <RuleField
              field="max_single_bet_pct"
              draft={draft}
              setField={setField}
              step="0.01"
              hint="0.5 = half the entry fee."
            />
            <RuleField
              field="max_single_bet_cap"
              draft={draft}
              setField={setField}
              hint="Hard ceiling, whatever the entry."
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <RuleField
              field="max_self_bet_pct"
              draft={draft}
              setField={setField}
              step="0.01"
              hint="Applies only to playing golfers."
            />
            <RuleField
              field="max_self_bet_cap"
              draft={draft}
              setField={setField}
              hint="Across the whole tournament, not per bet."
            />
          </div>
        </CardContent>
      </Card>

      {/* The derived limits — the numbers the raw parameters don't show. */}
      <Card className="gap-0 p-0">
        <div className="px-4 py-3">
          <div className="text-sm font-semibold text-text-strong">
            What that means per entry fee
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Updates as you type. Amounts floor rather than round, and the hard
            caps bind once the percentage passes them.
          </p>
        </div>

        {preview ? (
          <>
            <div className="grid grid-cols-3 gap-x-3 border-t border-border px-4 py-2 text-[10px] font-bold tracking-wider uppercase text-text-muted">
              <span>Entry</span>
              <span className="text-right">Max single bet</span>
              <span className="text-right">Max on yourself</span>
            </div>
            {preview.rows.map((row) => (
              <div
                key={row.entry_fee}
                className="grid grid-cols-3 gap-x-3 border-t border-border px-4 py-2 text-sm text-text-body"
              >
                <span className="font-semibold text-text-strong">
                  ${row.entry_fee}
                </span>
                <span className="text-right">${row.max_single_bet}</span>
                <span className="text-right">${row.max_self_bet}</span>
              </div>
            ))}
            <p className="border-t border-border px-4 py-2 text-xs text-text-muted">
              {preview.single_cap_binds_at !== null
                ? `The single-bet cap starts binding at a $${preview.single_cap_binds_at} entry.`
                : "The single-bet cap never binds in this entry range — the percentage always wins."}{" "}
              {preview.self_cap_binds_at !== null
                ? `The self-bet cap starts binding at $${preview.self_cap_binds_at}.`
                : "The self-bet cap never binds in this range."}
            </p>
          </>
        ) : (
          <p className="border-t border-border px-4 py-3 text-sm text-text-muted">
            Fix the values below and the table comes back.
          </p>
        )}
      </Card>

      {/* Errors: local ones as you type, server ones after a rejected save. */}
      {(localErrors.length > 0 || errors.length > 0) && (
        <ul className="flex list-disc flex-col gap-1 rounded-lg border border-loss-border bg-loss-surface py-2 pr-3 pl-7 text-sm text-loss-strong">
          {[...new Set([...localErrors, ...errors])].map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={busy || !dirty || localErrors.length > 0}>
          {busy ? "Saving…" : "Save rules"}
        </Button>
        {saved && !dirty && (
          <span className="text-sm text-win-strong">Saved.</span>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(toDraft(rules))
            setErrors([])
            setSaved(false)
          }}
          disabled={busy || !dirty}
        >
          Reset
        </Button>
      </div>

      {/* PRD §12 Q3, stated where it matters: a lowered cap doesn't reach back
          and unmake a wager that was legal when it was placed. */}
      <p className="rounded-lg border border-border bg-surface-sunken px-4 py-3 text-sm text-text-body">
        <span className="font-semibold text-text-strong">
          Changing a rule never re-checks placed wagers.
        </span>{" "}
        Whatever stands, stands — every wager keeps the odds and the limits it
        was placed under. New values apply to the next placement onward, so
        lowering a cap mid-tournament can leave existing slates above it, and
        the app will not reshape them.
      </p>
    </div>
  )
}
