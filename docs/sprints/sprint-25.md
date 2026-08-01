# Sprint 25 — Phase scheduling, close automation & countdown

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Read the ADR note before writing code** — this sprint adds a second and third mechanism for changing a bet's status, and today there is exactly one.

**Goal:** phases close themselves on schedule, Pat can close early or change the time, and the dashboard stops claiming betting is open when it isn't.

**Target:** before the Aug 28 feature freeze; the "no UI for the two time-critical moments" item is a **September readiness blocker** and should not slip · **Blockers:** [Sprint 22](sprint-22.md)'s import guards interact directly with scheduled closes — land those first.

**Reads:** `docs/adr/0001-bet-pick-architecture.md` (status is upload-driven — that's what this amends), `docs/PRD.md` §8 (lifecycle), `app/dashboard/page.tsx`, `components/countdown.tsx`, `docs/dry-run/GAMEPLAN.md` landmine #2.

### Why this sprint

Three findings from Jul 31 with one root: **the tournament's clock and its controls live outside the app.**

- [ ] **Amend ADR 0001 first — design decision, not code.** Today a bet's status changes **only** via spreadsheet upload. That is deliberate, and it is why the gameplan warns that `tournaments.status` doesn't gate betting. Adding a scheduler and a manual button means three writers to one field. Settle before building:
  - What happens when a scheduled close fires and Pat then uploads a sheet saying `open`? (This is exactly Sprint 22's new soft warning — the features interact.)
  - Does the scheduler close **bets**, or set a **tournament-level "phase closed at"** that betting is checked against? *The latter is probably right* — smaller blast radius, one source of truth, and it gives the countdown and the dashboard indicator something real to read.
  - Is a scheduled close reversible?
- [ ] **Scheduled closes + admin controls** ([#106](https://github.com/andrewelong18/ozark-open/issues/106)). **Phase 1 closes Thu Sept 24 2026, 11:00 CT. Phase 2 closes Sat Sept 26 2026, 11:00 CT.** (Verified against the calendar: Sept 24 2026 is a Thursday, Sept 26 a Saturday.) Admins can change both times, close a phase manually ahead of schedule, and toggle whether members see the countdown. New columns on `tournaments` — migration file only. `components/countdown.tsx` already exists and is deliberately low-key per the brand rule (*no countdown-timer anxiety* — neutral ink, tabular numbers, no red); **keep that character** even though the thing it now counts to is a deadline.
- [ ] **Per-phase dashboard indicators** ([#107](https://github.com/andrewelong18/ozark-open/issues/107)). The dashboard showed a green **"Betting Open"** badge while `/bets` said *"No bets published yet"* — because `app/dashboard/page.tsx:119` reads `tournaments.status`, which doesn't gate betting. Replace with Phase 1 and Phase 2 open/closed state derived from the same source of truth the scheduler lands on. Pat asked for this to be wired to the countdown, so build them together.
- [ ] **UI for the two time-critical moments** ([#108](https://github.com/andrewelong18/ozark-open/issues/108)) — **the P0 of this sprint.** Both currently require database access:
  - **The chase list** (Thursday morning, minutes before tee-off) is a raw SQL file with no page anywhere.
  - **Unlocking `/results`** (Saturday night) needs `UPDATE tournaments SET status='completed'`. There is no button, and it is *dangerous*: `aggregatePayouts()` (`lib/payouts.ts:74`) **skips** pending placements rather than zeroing them, so flipping while any pick is still `pending` splits the whole pool across only the settled wagers. The numbers look plausible and are wrong, and nothing warns.

  Either build the controls or write a runbook a non-developer can follow. **Regardless of which: the completed-flip must refuse, or warn hard, while any pick is pending.** That guard is worth having even with no button. Supersedes issue [#36](https://github.com/andrewelong18/ozark-open/issues/36).

**Done when:** a phase closes itself at its configured time; Pat can change that time or close early from the app; members see or don't see a countdown per the toggle; the dashboard agrees with `/bets` in all four states (nothing published · P1 open · P1 closed + P2 open · both closed); the final unlock cannot silently produce wrong payouts; and `bash scripts/dry-run-verify.sh` still passes end to end.

### Out of scope (don't build)

- **Notifying anyone that a phase is about to close.** Notifications stay globally out of scope — the countdown is the warning.
- **Auto-voiding or auto-correcting non-compliant bettors at close.** Q3 stands: whatever stands, stands.
- **Scheduling anything else** — no scheduled results, no scheduled menu publishing. The spreadsheet stays the way the menu and verdicts arrive.
- **A general admin job runner.** Two timestamps and a flag on the `tournaments` row, not a task system.
