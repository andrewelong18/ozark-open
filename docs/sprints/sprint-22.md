# Sprint 22 — Rule reinforcement & import guards

> Part of the [Ozark Open roadmap](../ROADMAP.md). **The ripple sprint.** Every item changes a settled rule, so code, schema, the admin chase query, the PRD and ADR 0001, and the existing unit tests all move together. `CLAUDE.md`: *docs beat code* — update the docs deliberately rather than letting the code drift ahead of them.

**Goal:** make the money rules say what Pat actually means, and stop the spreadsheet accepting a file that publishes verdicts onto a live book.

**Target:** before the Aug 28 feature freeze, and well before Sept 10 · **Blockers:** none hard, but land [Sprint 21](sprint-21.md) first so a rule change isn't debugged on top of known defects.

**Reads:** `docs/PRD.md` §7 (the money rules) and §8.1 (enforcement timing), `docs/adr/0001-bet-pick-architecture.md`, `lib/validation.ts`, `docs/OUTSTANDING_DECISIONS.md` (the Jul 31 resolutions table).

### Why this sprint

Act 4.17 of the dry run existed to settle one question, and it did. Two more rule gaps surfaced on the night — one of them by actually biting us.

- [ ] **Pick minimum becomes tournament-wide** ([#96](https://github.com/andrewelong18/ozark-open/issues/96)). **Minimum 5 across both phases combined; maximum stays 10 per phase; the minimum is only evaluated before Phase 2 close.** Today `min_picks_per_phase` is enforced per phase, which means betting in both phases silently forces you to ≥10 picks — 5 in Phase 1 and 3 in Phase 2 is flagged non-compliant. That is not what "5–10 picks" ever meant.

  Everything below moves in one commit series: a **migration** for the tournament-wide minimum (new file in `supabase/migrations/`, never a Studio edit) · `checkPhaseMinimums()` (`lib/validation.ts:257`) rewritten to sum both phases and report only at Phase 2 close · `validatePhasePickCount()` (`:141`) **unchanged**, it already does the per-phase max correctly · `/my-bets` banner copy in `lib/my-bets.ts` · PRD §7/§8.1 · ADR 0001 · and `lib/validation.test.ts`, which currently encodes the old rule and must be **rewritten intentionally, not deleted to make things green**.

  Keep the existing "a phase with zero placements never flags" behaviour — putting everything in one phase stays legal (Q2).

- [ ] **Two import guards, deliberately different severities** ([#97](https://github.com/andrewelong18/ozark-open/issues/97)).
  - **Hard block:** if a bet's `status` is not `closed`, every `result` on it must be `pending`. Reject the whole file with per-row errors, consistent with the atomicity guarantee. This is the one that bit us — Pat uploaded a results-bearing sheet with `status = open` and the app took it silently, publishing verdicts while stake inputs were still showing.
  - **Soft warning:** a bet marked `open` after its phase has closed. Report it, let Pat confirm and proceed — reopening may be a legitimate call. Same treatment as the existing "odds changed on a pick with live placements" warning.

  Both are cross-field checks, so they belong with the duplicate-`pick_id` logic in `lib/import.ts`, not the per-cell pass (see `:262` and `:327` for the error-message style).

- [ ] **Rewrite the chase query** ([#98](https://github.com/andrewelong18/ozark-open/issues/98)). At Phase 1 close `docs/admin/phase-compliance.sql` flagged **13 of 14 people** on `off_exact_total`, burying the one real straggler. The column is only meaningful at Phase 2 close — before that, everyone is legitimately incomplete. Make it phase-aware, and consider emitting a plain-text "text these people" line, since Pat reads this on a phone minutes before tee-off. Do it in the same pass as the pick-minimum change; both alter what the query reports.

- [ ] **Close OUTSTANDING_DECISIONS §2 — docs only.** Non-playing bettors get the **same min and max rules as players**. No code change: the `is_player` branch in `validateSelfBetTotal` (`:156`) is a correct no-op, because no pick bears a non-player's name. Already recorded; verify the PRD agrees.

**Done when:** `npm run test` passes with tests asserting the *new* pick-count rule; a fixture with `status=open` + a non-pending result is rejected with a clear per-row message; a stale-open bet produces a warning that doesn't block; the chase query at Phase 1 close names only people who need a text (against the dry-run dataset, exactly one); and `bash scripts/dry-run-verify.sh` still ends with the expected payout table — it will catch a rule change that breaks the pool math.

### Out of scope (don't build)

- **Scheduled or manual phase closes.** Sprint 25 — and it needs an ADR amendment first, because it adds a second and third mechanism for changing a bet's status.
- **Relaxing any other §7 rule.** The self-bet cap, the opponent block, the max single bet and the exact-total requirement are all settled and were verified working on Jul 31.
- **Auto-correcting non-compliant bettors.** Q3 stands: whatever stands, stands. The chase query informs; it never enforces.
