# Sprint 17 — Bet-Slip Review & Confirmation (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting. Born from `docs/COMPETITIVE_ANALYSIS.md` §1.3 (review-before-commit) with §1.5 (bet receipt) folded in.

**Goal:** a review-before-commit surface over the placements that already exist — on `/bets`, a sticky summary bar that answers "how much of my entry have I wagered, and am I balanced?" while you scroll the menu — plus a per-placement receipt showing the locked odds on place/edit. It reinforces the exact-total rule (`checkTournamentTotal`, PRD §7 rule 6) at the moment it matters and makes the odds-snapshot behavior visible (a "but the odds changed!" defense).
**Target:** before the group dry run (Sprint 9) if it fits — genuinely useful the first time someone spreads 5–10 picks across two phases · **Blockers:** none hard; builds on Sprint 4 (placement API) and Sprint 5 (`/my-bets` review surface), both code-complete.

**Reads:** `PRD.md` §7/§8.1 (bet rules + enforcement timing), `lib/validation.ts` (`checkTournamentTotal` / `checkPhaseMinimums` — reuse, don't re-derive), `lib/my-bets.ts` (`buildComplianceSummary`, `normalizeMyBets`), `app/api/placements/route.ts` (returns `odds_at_placement` on every write), `app/my-bets/page.tsx` (the full per-pick review panel this bar links to), the `ozark-open-design` skill (sticky footer + receipt styling).

**Not a real bet slip.** No draft/uncommitted state, no new commit flow, no new wager types, rules, or schema (ADR 0001 is settled). Placement stays inline and immediate — this is a review/confirm *surface* that reads existing data. The numbers come straight from the same `lib/validation.ts` + `lib/my-bets.ts` helpers `/my-bets` uses, so the two views can never disagree.

- [ ] Sticky balance/review bar on `/bets` (participants only): total wagered `$X of $Y`, pick count, remaining `$Z`, and the balanced / `$Z-to-go` / phase-incomplete standing — reusing `checkTournamentTotal` + `buildComplianceSummary` (no new rule logic). Links to `/my-bets` for the full per-pick panel.
- [ ] Clear "you still owe $Z / you're balanced" messaging tied to the exact-total rule — surfaced verbatim from the §8.1 checks, friendly, never blocking (Q3).
- [ ] Per-placement receipt on place **and** edit: the snapshotted `odds_at_placement` + stake shown as a locked-odds confirmation under the row ("✓ Locked in · +450 · $5 · odds locked at placement"); cleared on remove. Surfaces data the API already returns.
- [ ] Explicit confirm step on both writes (the literal "review before commit"): placing stages an inline "Lock in $X on <pick> at <odds>?" strip and only POSTs on confirm; removing — a destructive action — stages a "Remove your $X on <pick>?" strip and only soft-deletes on confirm. No single-tap lock-in or wipe; inline strips, no browser dialogs.
- [ ] Reuse, don't duplicate: the `/bets` page loads placements in the same shape as `/my-bets` so `normalizeMyBets` and the compliance checks run verbatim; the receipt reads the write's own return row.

**Done when:** a participant placing bets on `/bets` sees a live running summary (total vs entry, remaining, balanced ↔ short) update as they place, must confirm before a bet locks in or is removed, gets a receipt showing the locked odds on each place/edit, and never has to leave for `/my-bets` to know where they stand — with the summary numbers matching `/my-bets` exactly.
