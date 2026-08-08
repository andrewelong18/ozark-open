# Sprint 25 — Phase scheduling, close automation & countdown

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Read the ADR note before writing code** — this sprint adds a second and third mechanism for changing a bet's status, and today there is exactly one.

**Goal:** phases close themselves on schedule, Pat can close early or change the time, and the dashboard stops claiming betting is open when it isn't.

**Target:** before the Aug 28 feature freeze; the "no UI for the two time-critical moments" item is a **September readiness blocker** and should not slip · **Blockers:** [Sprint 22](sprint-22.md)'s import guards interact directly with scheduled closes — land those first.

**Reads:** `docs/adr/0001-bet-pick-architecture.md` (status is upload-driven — that's what this amends), `docs/PRD.md` §8 (lifecycle), `app/dashboard/page.tsx`, `components/countdown.tsx`, `docs/dry-run/GAMEPLAN.md` landmine #2.

### Why this sprint

Three findings from Jul 31 with one root: **the tournament's clock and its controls live outside the app.**

- [x] **Amend ADR 0001 first — design decision, not code.** Today a bet's status changes **only** via spreadsheet upload. That is deliberate, and it is why the gameplan warns that `tournaments.status` doesn't gate betting. Adding a scheduler and a manual button means three writers to one field. Settle before building:
  - What happens when a scheduled close fires and Pat then uploads a sheet saying `open`? (This is exactly Sprint 22's new soft warning — the features interact.)
  - Does the scheduler close **bets**, or set a **tournament-level "phase closed at"** that betting is checked against? *The latter is probably right* — smaller blast radius, one source of truth, and it gives the countdown and the dashboard indicator something real to read.
  - Is a scheduled close reversible?
- [x] **Scheduled closes + admin controls** ([#106](https://github.com/andrewelong18/ozark-open/issues/106)). **Phase 1 closes Thu Sept 24 2026, 11:00 CT. Phase 2 closes Sat Sept 26 2026, 11:00 CT.** (Verified against the calendar: Sept 24 2026 is a Thursday, Sept 26 a Saturday.) Admins can change both times, close a phase manually ahead of schedule, and toggle whether members see the countdown. New columns on `tournaments` — migration file only. `components/countdown.tsx` already exists and is deliberately low-key per the brand rule (*no countdown-timer anxiety* — neutral ink, tabular numbers, no red); **keep that character** even though the thing it now counts to is a deadline.
- [x] **Per-phase dashboard indicators** ([#107](https://github.com/andrewelong18/ozark-open/issues/107)). The dashboard showed a green **"Betting Open"** badge while `/bets` said *"No bets published yet"* — because `app/dashboard/page.tsx:119` reads `tournaments.status`, which doesn't gate betting. Replace with Phase 1 and Phase 2 open/closed state derived from the same source of truth the scheduler lands on. Pat asked for this to be wired to the countdown, so build them together.
- [x] **UI for the two time-critical moments** ([#108](https://github.com/andrewelong18/ozark-open/issues/108)) — **the P0 of this sprint.** Both currently require database access:
  - **The chase list** (Thursday morning, minutes before tee-off) is a raw SQL file with no page anywhere.
  - **Unlocking `/results`** (Saturday night) needs `UPDATE tournaments SET status='completed'`. There is no button, and it is *dangerous*: `aggregatePayouts()` (`lib/payouts.ts:74`) **skips** pending placements rather than zeroing them, so flipping while any pick is still `pending` splits the whole pool across only the settled wagers. The numbers look plausible and are wrong, and nothing warns.

  Either build the controls or write a runbook a non-developer can follow. **Regardless of which: the completed-flip must refuse, or warn hard, while any pick is pending.** That guard is worth having even with no button. Supersedes issue [#36](https://github.com/andrewelong18/ozark-open/issues/36).

**Done when:** a phase closes itself at its configured time; Pat can change that time or close early from the app; members see or don't see a countdown per the toggle; the dashboard agrees with `/bets` in all four states (nothing published · P1 open · P1 closed + P2 open · both closed); the final unlock cannot silently produce wrong payouts; and `bash scripts/dry-run-verify.sh` still passes end to end.

### Out of scope (don't build)

- **Notifying anyone that a phase is about to close.** Notifications stay globally out of scope — the countdown is the warning.
- **Auto-voiding or auto-correcting non-compliant bettors at close.** Q3 stands: whatever stands, stands.
- **Scheduling anything else** — no scheduled results, no scheduled menu publishing. The spreadsheet stays the way the menu and verdicts arrive.
- **A general admin job runner.** Two timestamps and a flag on the `tournaments` row, not a task system.

---

## Shipped — Aug 8, 2026

All four items, on `claude/sprint-25-phase-clock` (branched off Sprint 22, which
it depends on for `checkPickMinimum`).

**Verified locally:** `npm test` (246 pass, adding `lib/phases.test.ts` and
`lib/chase.test.ts`) · `npx tsc --noEmit` (one pre-existing error in
`lib/profile.test.ts`, [#87](https://github.com/andrewelong18/ozark-open/issues/87)) ·
`npm run build` · `bash scripts/local-db-verify.sh` · `bash scripts/dry-run-verify.sh`
(ends "passes end to end"; pool table unchanged at $425 − $32 = $393, 0 pending).

### The design, settled first

The ADR amendment (§5a) is the load-bearing decision: **the scheduler never writes
`bets.status`.** A deadline per phase lives on the `tournaments` row and wagering is
gated on both, so the upload only ever *opens* a bet and the clock only ever *closes* a
phase. They're different fields, so they can't contradict each other — which answers all
three of the sprint's questions at once. A sheet marked `open` after the deadline doesn't
reopen betting and isn't silently reverted; the blast radius is one row rather than
thirteen; and a close is reversible because it's a timestamp, not a mutation.

**There is no scheduler.** A phase closes itself because every read compares `now()` to a
stored timestamp — two timestamps and a flag, exactly as the sprint's out-of-scope note
demanded.

### The P0, and what it actually was

The sprint file said the unguarded flip was silent. It was half-right, and the correction
is worth recording: `/results` **already** warned when picks were pending. What it did
anyway was render the full table — winner spotlight and gold leader row — from a split
that divides the pool across only the settled wagers. So the numbers were wrong, loudly
labelled, and still shareable.

Both halves are fixed. `finalizeReadiness()` refuses the flip (counting **picks**, not
placements — a pick nobody wagered on is invisible to `ResultsTable.pending` but is still
an unresolved verdict), and `/results` withholds the spotlight until the table settles.

`dry-run-verify.sh` now proves the hazard on the real dataset rather than asserting it
abstractly: dropping one settled pick back to `pending` cuts the theoretical denominator
from **$628.67 to $525.77** while the pool stays **$393** — every share inflates about
20%, and the totals still reconcile.

### Notes

- **Neither migration is applied to production.** The Supabase MCP returns `Unauthorized`
  in this environment — no `SUPABASE_ACCESS_TOKEN`. Sprint 22's is
  [#117](https://github.com/andrewelong18/ozark-open/issues/117), this sprint's is
  [#120](https://github.com/andrewelong18/ozark-open/issues/120); apply in that order.
  Browser pass is [#121](https://github.com/andrewelong18/ozark-open/issues/121), and the
  importer's clock-informed warning — anticipated by ADR 0001 §5a but not wired, since
  `validateSheet()` is pure — is [#122](https://github.com/andrewelong18/ozark-open/issues/122).
- `/bets` gates stake inputs through a new `wagering_open` field rather than by faking the
  bet's `status`. Faking it would have fired the post-close **reveal** early, and RLS gates
  those rows on the real DB status — so it would have rendered an empty panel that looked
  broken. The clock closes *wagering*; the upload closes *the bet*.
- `/admin/close` is a fourth copy of the inline admin gate. [#81](https://github.com/andrewelong18/ozark-open/issues/81)
  (extract a shared `requireAdmin()`) is now worth doing.
