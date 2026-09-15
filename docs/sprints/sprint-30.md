# Sprint 30 — Per-phase entries, per-phase pots, and the entry request

> Part of the [Ozark Open roadmap](../ROADMAP.md). ✅ **Code complete Sept 14, 2026** — production rollout pending (#234). **Post-freeze** (Andrew, Sept 14, 2026 — from Pat's rewritten rules after the Sept 4 user test). **This sprint changes the money model.** Read ADR 0002 before touching `lib/validation.ts`, `lib/payouts.ts` or either trigger.

**Goal:** the two betting phases become two separate entries and two separate pots — each with its own $20–$50 entry, its own 5-pick minimum, its own pari-mutuel split, and its own forfeit/refund rules for money left on the table — and members ask for their entry in the app instead of by text.

**Target:** Sept 16, 2026 (eight days before Phase 1 closes) · **Blockers:** none in the repo. Production carries entries and wagers placed under the old rules; they are reset as part of the rollout (§ Rollout below), not migrated.

**Reads:** `docs/adr/0002-per-phase-entries-and-pots.md` (the whole decision), `docs/PRD.md` §5, §7, §8.1, §12 A25–A26, `docs/DATA_MODEL.md` §3.3, §3.7, §3.9, §4, `supabase/migrations/20260902000001_placement_total_guard.sql` (the trigger this sprint rewrites), `lib/validation.ts`, `lib/payouts.ts`.

### Why this sprint

Sept 4, 2026: most testers (Ethan, Alex, Devin, …) spent their whole $20 in Phase 1. Under the tournament-wide model that was legal and left two problems — nothing for Phase 2, and a 5-pick minimum that could no longer be met. Pat's answer (Sept 2026):

> Phases 1 and 2 are now more separated. $20 minimum and $50 maximum for each phase. 5 bet minimum for each phase, no maximum. Phase 1 and Phase 2 will now become separate pots. […] Any money left on the table that is below the minimum $20 bet amount will be forfeited to the pool. […] If someone exceeds the $20 minimum but doesn't reach their entry, that difference will be refunded. […] Simplify maximum single bet to $10. Simplify maximum total bet on yourself to a quarter of your total phase entry if that total entry is fully submitted.

Plus two asks that ride along: refuse an upload with a `Match` bet that doesn't have exactly two picks, and a one-time in-app entry request (total + Phase 1/Phase 2 slider + playing-golfer flag, Venmo hand-off) so entries stop being a text to Pat.

### The calls

Recorded in full in ADR 0002 and PRD §12 **A25** (money) / **A26** (entry request); in short:

1. **Per bettor, per phase:** `C = min(E, max(W, $20))` funds the pot; `E − C` is refunded; `C − W` is forfeited. Self-bets are recognised only up to 25 % of what was **wagered** (pro-rata across self picks); the excess stays in the pot. Combined = the sum of the two phase results per person, never a combined split.
2. **Two nullable entry columns** on `tournament_participants`; NULL = not entered. Two triggers: the placement cap per phase (`OZ001`), and a new guard that refuses lowering an entry below what is already wagered (`OZ002`).
3. **The entry request is its own table** (`entry_requests`), written once per member per tournament, read by the admin at approval. Paid entirely by Venmo to Andrew, memo `golf`.
4. **The money board is a page** — `/standings`, labelled *Leaderboard* in the nav, with a Phase 1 / Phase 2 / Combined toggle; the dashboard keeps rendering the same board once the tournament completes (A20).

### Tasks

- [x] `docs/sprints/sprint-30.md` + ROADMAP rows.
- [x] Migration A (`20260914000000_per_phase_entries.sql`): the two entry columns, `min_picks_per_phase`, `max_single_bet`, the view's `phase`/`is_self_pick`, the per-phase `enforce_placement_total()`, the new `enforce_participant_entry()`; `placement-roundtrip` proves the per-phase race and OZ002; `payout-view-roundtrip` proves the columns; grants manifest regenerated.
- [x] Migration A2 (`20260914000001_entry_requests.sql`): the table + RLS; `entry-request-roundtrip`; policies manifest regenerated; `db-export.sh` TABLES; `/api/health` check.
- [x] `lib/validation.ts` expanded: per-phase `Bettor`, `validatePhaseEntry`, flat `validateMaxSingleBet`, per-phase self and running totals, `phaseStanding()`.
- [x] `lib/placements.ts` + `lib/health.ts` read the new columns.
- [x] `lib/placement-write.ts`: the phase-entry 403 and the new OZ001 sentence.
- [x] `lib/payouts.ts`: `buildPhaseResults()` / `buildCombinedResults()`, the three identities, Pat's $50/$20/$12 example; `lib/standings.ts`, `lib/admin-view.ts`, `lib/settlement.ts` follow (`buildSettlementSummary()` deleted — #210).
- [x] `lib/rules.ts` + `/admin/rules`: five parameters.
- [x] `lib/my-bets.ts` + `lib/chase.ts`: per-phase banners and chase list.
- [x] `lib/roster.ts`, `lib/roster-page.ts`, `lib/collection.ts`: any-phase eligibility, owed = Σ entries, overpaid.
- [x] `POST/PATCH /api/admin/participants`: two fees, OZ002 → 400.
- [x] `lib/entry-request.ts` + `POST /api/entry-request`.
- [x] `components/entry/entry-request-form.tsx`, `/entry`, middleware, the onboarding step.
- [x] People console: two fees + player flag, prefilled from the request.
- [x] `/bets`: per-phase slip bar, `enteredPhases` gating.
- [x] `/my-bets`, dashboard, modules, onboarding/profile/style-guide copy.
- [x] `/standings` + `standings-board.tsx` + `standings-toggle.tsx` + nav + `phaseRevealed()`.
- [x] `/admin/close` + `/admin/view`.
- [x] `lib/import.ts`: Match two-pick refusal; phase change on a wagered bet refused.
- [x] Contract: the old rule fields and functions removed; grep proves zero readers.
- [x] Migration B (`20260914000002_drop_single_entry_columns.sql`) + every SQL reader of the old columns (export manifest, restore reconciliation, chase SQL, seeds, dry-run, sim).
- [x] E2E: the gauntlet per phase, the approval spec, the standings toggle, the entry request, the onboarding skip.
- [x] Docs: ADR 0002, PRD, DATA_MODEL, OUTSTANDING_DECISIONS, CLAUDE.md, README, checklist, DATA_SAFETY, DEV_TESTING, ARCHITECTURE, GAMEPLAN note.

**Done when:** a member entered in Phase 1 only is refused on a Phase 2 pick with a sentence naming the phase; two concurrent wagers cannot exceed a phase entry and the loser reads the OZ001 sentence; an admin cannot lower an entry below what is wagered in that phase; a $50 entry with $20 wagered and $12 on yourself pays out on $5 of it and refunds $30; a $50 entry with nothing wagered forfeits $20 and refunds $30; the slip bar, `/my-bets` and the dashboard all say so while the phase is open; the chase list at each close names everyone entered in that phase who isn't complete; the Leaderboard page toggles Phase 1 / Phase 2 / Combined and shows an open phase's pot only; a member can request an entry exactly once, sees the Venmo link and memo, and the dashboard and `/my-bets` carry a warning until money is added; an upload with a three-pick Match is refused by name; and `npm test` · lint · `tsc` · `npm run build` · `scripts/local-db-verify.sh` · `scripts/dry-run-verify.sh` · `scripts/sim-pool-verify.sh` all pass, with the new per-phase dry-run pool figures recorded below.

### Out of scope (don't build)

- **A live standings page for an open phase.** RLS hides other members' open-bet rows, so any number computed before the reveal is wrong money. The Leaderboard shows the pot until every bet in the phase closes.
- **A combined pari-mutuel split.** Combined is arithmetic over the two phase results.
- **The Google-Sheets `/leaderboard`.** Kept unlinked, as decided Sept 7.
- **Prefilled Venmo deep links.** The profile URL is used verbatim; the memo is shown as text.

### Rollout

Expand → migrate → contract, per `20260812000000_drop_min_picks_per_phase.sql`'s doctrine. Tracked, with the exact SQL and the token hand-off, in **#234** — not yet applied: the building session had no `SUPABASE_ACCESS_TOKEN`.

1. **Before the merge:** `list_migrations`; apply #222 (`20260911000000`) and #229 (`20260912000001`) if still missing, then **A** and **A2**, via the Supabase MCP. Verify the two entry columns, `entry_requests` and its three policies, and both trigger functions exist.
2. **The reset** (data, not schema), in this order — wagers first, because OZ002 refuses clearing an entry that still has wagers under it:
   1. `SELECT public.take_snapshot('manual');` — note the id. (The snapshot `trigger` column only accepts `cron` / `manual` / `pre-import` / `pre-restore`, so a custom label would fail.)
   2. `DELETE FROM public.bet_placements p USING public.bet_picks pk, public.bets b, public.tournaments t WHERE p.pick_id = pk.id AND pk.bet_id = b.id AND b.tournament_id = t.id AND t.year = 2026;`
   3. `UPDATE public.tournament_participants tp SET entry_fee = NULL, phase1_entry_fee = NULL, phase2_entry_fee = NULL, paid_amount = 0, paid_at = NULL, paid_note = NULL FROM public.tournaments t WHERE tp.tournament_id = t.id AND t.year = 2026;`
   4. Verify: 0 wagers for 2026, 0 participants with any entry, and the participant row count and names unchanged.
   5. `SELECT public.take_snapshot('manual');` — note the id. This is the first save state of the new model.
3. Merge → Vercel deploy → `/api/health` green (including `entry_requests_read`) → members request, admins approve as money lands.
4. **After the deploy:** apply **B** (`20260914000002`), confirm `/api/health`, take a manual snapshot.

### Verified locally (Sept 14, 2026)

| Check | Result |
|---|---|
| `npm test` | 568 pass, 0 fail (baseline 539 on `origin/main`) |
| `npm run lint` · `npx tsc --noEmit` · `npm run build` | clean · clean · builds, with `/standings`, `/entry` and `/api/entry-request` |
| `scripts/local-db-verify.sh` | passes end to end with A, A2 and B applied: both manifests (30 policies, 13 function grants), the WHERE-less DML check, every round trip including the per-phase race, cross-phase independence, six OZ002 cases and the 13-check entry-request RLS trip, and the chase SQL smoke |
| `scripts/dry-run-verify.sh` | **99 checks, passes end to end.** Both chase lines match `/admin/close` word for word. The three identities hold per pot and combined. Pat's $50 / $20 / $12 example (Mike Vemmer, Phase 2) recognises $5, forfeits $7 and refunds $30; Steve's untouched $50 forfeits $20 and refunds $30 |
| `scripts/sim-pool-verify.sh` | 32 members, 310 wagers, every one rule-valid; identities hold per pot and combined; Phase 2 under-wagerers forfeit and are refunded |
| `npm run test:e2e` | 75 passed, 10 failed, 4 skipped, run against an **isolated** local stack (see below). 7 failures are the pre-existing #217 set; the admin-approval spec #217 lists now passes. The other 3 are environmental: two filter chips measure 43px on macOS font metrics, and the mobile menu probe measures mid-animation. The serial results specs stop at #217 failures before the per-phase standings, so those were verified by hand |
| Manual browser pass | Slip bar, My Bets and the dashboard show Pat's example correctly; `/standings` Phase 1 reconciles to the cent by hand ($58 pool); the Phase 2 tab shows the $90 pot only; the completed dashboard's Combined board reconciles ($118 = $58 + $60); `/admin/view` agrees |

**Dry-run pool figures** (the expected answer for reconciliation, Act 10):

| Pot | Entries | Unwagered, refunded | Voided stakes | Pool |
|---|---|---|---|---|
| Phase 1 | $455 | $30 | $24 | **$401** |
| Phase 2 | $300 | $30 | $37 | **$233** |
| Combined | $755 | $60 | $61 | **$634** |

**Residue, as issues:** #234 production rollout · #235 Pat's three open calls (empty pot, self-bet line under $20, Group Match pick count) · #236 the untracked marketing seed writes `entry_fee` · #237 the three e2e failures diagnosed, plus two #217 fixture findings · #238 Base UI `nativeButton` dev warning. #210 (`buildSettlementSummary()` uncalled) is closed by this sprint's deletion.

**How e2e was run.** The shared local Supabase stack (project `ozark-open`, 9 days old, 22 accounts, migrations behind `origin/main`) belongs to the main checkout, and applying this sprint's destructive migration to it would break that checkout. So the suite ran against a second, throwaway stack (project `ozark-open-s30-e2e`, every port +100) with a Next dev server on :3130, reproducing `scripts/e2e-verify.sh`'s grants and seeds.
