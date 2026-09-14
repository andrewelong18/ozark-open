import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { OnboardingForm } from "@/components/onboarding/onboarding-form"
import { entryStatus, requestWindow, type RequestWindow } from "@/lib/entry-request"
import {
  PARTICIPANT_ENTRY_COLUMNS,
  toPhaseClock,
  toTournamentRules,
  TOURNAMENT_CLOCK_COLUMNS,
  TOURNAMENT_RULE_COLUMNS,
} from "@/lib/placements"
import type { TournamentRules } from "@/lib/validation"

// The required first-run step (Sprint 16). Middleware routes any authenticated
// member with onboarded_at IS NULL here; once they finish, the same middleware
// keeps them out. Belt-and-suspenders: we re-check here too.

// Copy-only fallbacks for a database with no tournament row yet; the entry
// step never renders in that case (the window below is closed).
const FALLBACK_RULES: TournamentRules = {
  entry_fee_min: 20,
  entry_fee_max: 50,
  min_picks_per_phase: 5,
  max_single_bet: 10,
  max_self_bet_pct: 0.25,
}
const CLOSED: RequestWindow = { phases: [], state: "closed" }

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle()
  // Fail direction, decided rather than inherited (#132): a failed read keeps
  // the member ON this page. The alternative — redirecting to /dashboard —
  // bounces off middleware straight back here for anyone genuinely not
  // onboarded, and a redirect loop is the one outcome nobody can escape.
  // middleware.ts:62 documents the same reasoning for the same gate.
  if (profileError) {
    console.error("[onboarding] onboarded_at read failed:", profileError.message)
  }
  if ((profile as { onboarded_at: string | null } | null)?.onboarded_at) {
    redirect("/dashboard")
  }

  // The rules are tournament data — read them, never hardcode them. They feed
  // the walkthrough's copy and the entry step's bounds.
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select(`id, status, ${TOURNAMENT_RULE_COLUMNS}, ${TOURNAMENT_CLOCK_COLUMNS}`)
    .in("status", ["upcoming", "active", "completed"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  // Copy and an optional step — the fallbacks cover a missing row, so this
  // logs and carries on rather than blocking the one step every member must
  // complete.
  if (tournamentError) {
    console.error("[onboarding] rules read failed:", tournamentError.message)
  }
  const row = (tournament as Record<string, unknown> | null) ?? null
  const rules = row ? toTournamentRules(row) : FALLBACK_RULES
  const window = row
    ? requestWindow(toPhaseClock(row), new Date(), { completed: row.status === "completed" })
    : CLOSED

  // The entry step is offered only while there's nothing on record — a member
  // an admin already approved (or who requested on a previous visit) goes
  // straight from the walkthrough to the menu.
  let showEntryStep = window.state !== "closed"
  if (row && showEntryStep) {
    const [{ data: participant, error: participantError }, { data: request, error: requestError }] =
      await Promise.all([
        supabase
          .from("tournament_participants")
          .select(PARTICIPANT_ENTRY_COLUMNS)
          .eq("user_id", user.id)
          .eq("tournament_id", String(row.id))
          .is("revoked_at", null)
          .maybeSingle(),
        supabase
          .from("entry_requests")
          .select("id")
          .eq("user_id", user.id)
          .eq("tournament_id", String(row.id))
          .maybeSingle(),
      ])
    if (participantError) {
      console.error("[onboarding] participant read failed:", participantError.message)
    }
    if (requestError) {
      console.error("[onboarding] entry request read failed:", requestError.message)
    }
    showEntryStep =
      entryStatus(
        (participant as { phase1_entry_fee?: unknown; phase2_entry_fee?: unknown } | null) ?? null,
        request ?? null
      ) === "none"
  }

  return (
    // dvh, not vh — see the note on app/login/page.tsx; same panel, same
    // mobile-Safari overshoot.
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-gradient-to-t from-ink-100 to-background px-6 py-8">
      <div className="w-full max-w-md">
        {/* The brand block belongs to the identity step only, so it lives inside
            the form component — the walkthrough steps lead with Jake instead. */}
        <OnboardingForm
          userId={user.id}
          email={user.email ?? ""}
          rules={rules}
          window={window}
          showEntryStep={showEntryStep}
        />
      </div>
    </div>
  )
}
