# Sprint 26 — Phase-first bet menu

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Post-freeze** (Andrew, Sept 7, 2026 — second dry run with Pat). Presentation only: no schema, no new math, nothing that touches money. **Read `lib/bet-filters.ts`'s header comment before writing code** — it argues explicitly against what this sprint does, and rewriting it is part of the work.

**Goal:** `/bets` toggles between **Phase 1** and **Phase 2** instead of Open and Closed, and the status badge describes the phase you are looking at rather than the whole book.

**Target:** Sept 12, 2026 — first of the three post-dry-run sprints, and the only one members see before tee-off, so it needs a real browser pass · **Blockers:** none. Independent of 27 and 28.

**Reads:** `lib/bet-filters.ts` (the whole file — its header is the decision being overturned), `lib/phases.ts` §Display, `lib/chase.ts:69` (`closingPhase`), `components/betting/bets-menu.tsx`, `app/bets/page.tsx`, `docs/adr/0001-bet-pick-architecture.md` §4 + §5a (what a phase *is*), `docs/sprints/sprint-24.md` (#104 — the filter refactor this amends).

### Why this sprint

Pat drove the menu for a second time in September and said the toggle is wrong. His words:

> Instead of open and closed toggle, it should instead be a phase 1 and phase 2 toggle. If phase 2 bets are hidden, then just say that phase 2 isn't open yet.
>
> On the bet menu, the open and closed status badge should be specific to phase 1 or phase 2, depending on what the user is toggled to.

He is describing the mental model the tournament actually runs on. The app has carried `phase` through every layer since Sprint 1 — the `PhaseGroup[]` tree reaches `bets-menu.tsx` intact — and has **never rendered it**. The menu's one visible axis has always been a status the sheet controls, not the window the weekend is organised around.

- [x] **The toggle becomes Phase 1 | Phase 2** ([#193](https://github.com/andrewelong18/ozark-open/issues/193)). **Amended in build (Andrew, Sept 7):** the two secondary strips also merged into **one** scrolling chip row — rounds spelled out ("Round 1", not "R1") ahead of the categories, one `All Bets` reset instead of two, no visible scrollbar. That was not in the plan; it is the honest rendering of a model that has only ever allowed one selection at a time, and it gives a phone back a row of chrome. `lib/bet-filters.ts` swaps its axis: `filterPhases()` gains the `p.phase === selected` predicate it has never had, and `availableRounds` / `availableCategories` / `facetIsAvailable` / `reconcileFacet` derive from the selected phase instead of the status view — which keeps #104's real prize, that **no selectable option can empty the page**. `defaultStatusView` / `showStatusToggle` / `matchesStatus` go away; the default phase delegates to the existing, tested `closingPhase(bets)` in `lib/chase.ts:69`. **Reuse it, don't reimplement it.** The tabs are a fixed `[1, 2]` pair, **not derived from `phases`** — Phase 2 ships `hidden` until Friday's upload #3, so a derived strip would never show the tab Pat explicitly asked to see.
- [x] **The badge describes the selected phase** ([#194](https://github.com/andrewelong18/ozark-open/issues/194)). `lib/phases.ts:phaseState()` already returns the exact three states — `unpublished` / `open` / `closed` — and is already unit-tested. Do not write a second one. `app/bets/page.tsx` computes it for both phases server-side and passes them down; `menuStatus()` and the `<h1>`-adjacent badge are deleted, and **the badge moves onto the toggle row**, because it now describes what the toggle selects. `StatusBadge` gains a fourth variant for `unpublished` — "Not open yet", neutral, no live ping dot.
- [x] **Three mitigations, because this reverses #104 and that cost is real.** Sprint 24 made status a *partition* so a closed bet and an open bet never sit in one list looking alike. Mid-tournament, a Phase 1 view now holds `closed`, revealed Round 1 bets beside Phase 1 Tournament bets still marked `open` in the sheet. Keep it legible **without a second control**:
  - **Open bets sort before closed** inside each round → category group (`groupBets()`, `app/bets/page.tsx:59-98`).
  - **Open bets get a status badge.** Today only closed/resolved cards carry one; `BetPlacementCard` renders none. In a mixed list an unlabelled card *is* the ambiguity #104 was about.
  - **Badge the limbo state** ([#195](https://github.com/andrewelong18/ozark-open/issues/195)) — **fixed by construction rather than by a special case:** both cards now take their badge from one expression keyed on `wagering_open`, the field that already decides which card renders, so the label and the card cannot disagree — a bet past its phase deadline but not yet `closed` in the sheet renders through `ClosedBetCard` with **no badge at all**, because that badge is gated on `bet.status !== "open"`. Roughly a 10-hour window on Thursday and again on Saturday, both of them when the page is refreshed hardest. Badge it "Closed"; **do not imply the reveal** — RLS returns no placements until the sheet closes the bet.
- [x] **Update the six E2E specs that click "Open" / "Closed" by name**, in the same commit: `e2e/bets-menu.spec.ts:83,84,101` · `mobile-layout.spec.ts:230,244` · `mobile-shots.spec.ts:52` · `motion.spec.ts:226` · `results-and-reveal.spec.ts:57`. Rewrite `lib/bet-filters.test.ts`'s defaulting tests against the phase axis.
- [x] **Record the reversal** as PRD §12 **A19**, and rewrite `lib/bet-filters.ts`'s L87-98 header comment rather than deleting it. A comment that contradicts shipped behaviour is drift, and that comment is the best statement of what we are giving up.

**Done when:** the menu opens on Phase 1 | Phase 2 with the current phase preselected; the badge beside the toggle reads that phase's state and an unpublished Phase 2 says "isn't open yet" instead of vanishing; every round and category chip still matches at least one bet; open bets are badged and sort above closed ones; a bet past its deadline but still `open` in the sheet is badged rather than blank; and `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` and the updated E2E specs all pass.

### Out of scope (don't build)

- **A second status control.** One toggle is the ask, and stacking two would re-create the "which of three controls emptied the page" problem #104 removed.
- **Changing what the reveal shows, or when.** `bets.status = 'closed'` stays the upload's alone (ADR 0001 §5a), and RLS gates the placement rows on it.
- **Touching `wageringOpen()`, the phase clock, or `/admin/close`.** The clock closes wagering; the upload closes the bet. Neither changes here.
- **Sorting or grouping beyond open-before-closed.** Phase → round → category → `sheet_bet_id` stays.


---

## Shipped — Sept 7, 2026

Three commits on `claude/sportsbook-phase-leaderboard-2l7hg9`: the axis swap, the
E2E fixture and specs, and the docs.

**Verified locally:** `npm test` (474 pass, up from 472 — `bet-filters.test.ts`
rewritten, two `phaseState` cases added) · `npx tsc --noEmit` · `npm run lint` ·
`npm run build` · `bash scripts/dry-run-verify.sh` end to end, pool unchanged at
$425 − $32 = **$393** with the payout table matching Appendix A row for row,
which is the check that proves a presentation sprint stayed one.

### The thing that would have made this sprint a no-op

`bet-filters.test.ts`'s fixture had **phase and status perfectly correlated** —
phase 1 all closed, phase 2 all open — and twelve of its eighteen tests ran
against it. Partitioning that tree by status and partitioning it by phase return
byte-identical answers, so a rewrite that renamed `"open"→2` and `"closed"→1`
would have gone green **whether or not the implementation switched axes at all.**
The same correlation exists in `supabase/seed-sim-pool.sql`.

Every fixture now holds mixed statuses inside one phase, and the suite was proven
able to fail rather than assumed sound: sabotaged to filter by status, three tests
go red, including the one named for it. That is the same discipline Sprints 11 and
25 applied to their guards, and it is the only reason this file can claim the axis
actually moved.

### Departures from the plan, recorded rather than silently diverged

- **The chip row merge** (above) was decided during the build, not in the sprint
  text.
- **#195 is fixed by construction**, not as its own branch. One `betBadge()`
  expression keyed on `wagering_open` serves both cards; the unbadged limbo state
  was only reachable because the badge asked `status` a question `status` cannot
  answer.
- **The E2E fixture gained a Phase 2** (two `hidden` bets), which the sprint text
  did not anticipate. Without it a Phase 2 tab had nothing behind it in any
  browser run — the seed was Phase 1 only, and said so in a comment naming the
  toggle this sprint replaced.

### Follow-up — Sept 7, 2026: both empty states name themselves

Andrew, after reading the build: an empty phase and an empty filter should each
say so plainly. Both already rendered a message; both now lead with the fact and
offer the tap that undoes it.

- **Empty phase** — title is now *"No bets in Phase N yet"*, with Pat's sentence
  ("Phase 2 isn't open yet — it opens after Round 2…") as the explanation
  underneath. Plus a **"See Phase 1 instead"** button, offered only when the
  other tab actually has something: on opening night neither phase does, and a
  button to an equally empty tab is worse than no button.
- **Empty filter** — *"No bets match this filter"*, naming the active chip
  (*Nothing in Phase 1 is filed under "Round 1"*) and offering **"Show all
  Phase N bets"**. This state is still **unreachable by construction** — one
  facet at a time, every chip derived from the selected phase — and it is here
  anyway, because "unreachable" is a property of today's code and a member
  looking at a blank list deserves better than our confidence in it.

**Two bugs fixed in the same pass, one of them shipped an hour earlier.**
`glyph="\u23f3"` was written as a JSX *attribute* string, and JSX attributes are
not JS string literals — backslash escapes are not processed, so it would have
rendered the literal text. Every glyph is a real emoji now, matching the rest of
the app, and it was verified by grepping the compiled bundle rather than by
reasoning about it. The same pass found a spec asserting
`getByRole("heading", …)` against `EmptyState`'s title, which is a styled
`<div>` with no heading role and would never have matched.

### Notes

- The badge beside the toggle reuses `phaseState()` rather than adding a second
  source of truth, so `/bets` and `/dashboard` now read the same function and
  cannot disagree about whether a phase is open.
- `StatusBadge` gained a fourth variant, `unpublished` ("Not open yet"). It is the
  only variant no bet card renders — it describes a *phase*. It does not ping:
  `DESIGN_SYSTEM.md` §4 allows ongoing animation only where it carries information
  true just while it runs, and a phase that hasn't opened carries none.
- **Residue:** the browser pass on a phone
  ([#201](https://github.com/andrewelong18/ozark-open/issues/201) — worth doing
  alongside [#127](https://github.com/andrewelong18/ozark-open/issues/127), same
  page and same device), and `npm run test:e2e` unexecuted for want of Docker
  (the standing [#172](https://github.com/andrewelong18/ozark-open/issues/172)
  constraint), which means this sprint's three new specs have never actually run.
- **Filed, not fixed:** `supabase/seed-sim-pool.sql` has the same phase↔status
  correlation the unit fixture had
  ([#202](https://github.com/andrewelong18/ozark-open/issues/202)). Nothing
  depends on it today, but the next person to use that seed for anything
  phase-related would get a green run that proves nothing.

---

## Follow-up — Sept 10, 2026: three filter levels (PRD §12 A23)

Pat drove the menu a third time and rejected the chip-row merge this sprint made
during its build. His revision, verbatim:

> There should be three levels of filters:
>
> 1. The top filter should be Phase 1 and Phase 2. Both can always be visible. If
>    there aren't any bets published you can say that bets for Phase 1 or Phase 2
>    will be released soon (or at a particular time).
> 2. The middle filter should be the round that the bets are associated with.
>    These include Round 1, Round 3, and Tournament. There will never be a Round
>    3 bet for Phase 1 or a Round 1 bet for Phase 2.
> 3. The bottom filter is bet category. Top Finisher, Top X Finisher, Match,
>    Group Match, and Prop Bet are the only options. Medalist is not a bet
>    category.
>
> In all three cases, the toggle should function like a radio button, where you
> may only choose one condition for each filter at a time.

Level 1 was already this sprint's work and barely changed. Levels 2 and 3 are
the change, and the interesting word in the ask is **"three levels"** — they have
to *compose*. `lib/bet-filters.ts` allowed exactly one secondary facet, so
"Phase 1 + Round 1 + Match" was not merely unrendered, it was unrepresentable:
clicking Match replaced Round 1.

**What shipped**

- `lib/bet-taxonomy.ts` — one home for `CATEGORIES`, `ROUND_ORDER`,
  `ROUND_LABEL` and the new `ROUNDS_BY_PHASE`. The lists were spread across four
  files; three filter rows reading them on every render is the wrong moment to
  add a fifth copy.
- `Facet` → `BetFilter { phase, round, category }`. `filterPhases()` applies the
  round and the category as two independent predicates. `reconcileFilter()`
  drops a round the new phase cannot hold and always keeps the category.
- The options went **static**. `availableRounds` / `availableCategories` /
  `facetIsAvailable` are gone; rows come from `ROUNDS_BY_PHASE` and `CATEGORIES`.
- The importer stopped trusting `bet_categories` for *names*. See below.

**What this cost, and why we paid**

#104's guarantee — no selectable option can empty the page — is gone. Phase 1
offers Round 1, and offers Prop Bet, and there is no Round 1 Prop Bet. This
sprint had already conceded the point at the phase level; it now applies one
level down. Two things pay for it, neither a fourth control: the rows are fixed
and stop reshuffling as the sheet is uploaded, and the "no bets match this
filter" screen — which this sprint shipped calling itself unreachable by
construction — is now a real, reachable, E2E-asserted state that names **both**
active conditions.

**"Medalist is not a bet category" was a real hole**

`bet_categories` has no CHECK constraint, and `validateSheet()` took the legal
names as an argument the route filled from *every row of that table*. A stray
row was enough to make an off-contract category importable and then render it as
a filter chip, because `availableCategories()` appended unknowns sorted last. In
this repo Medalist is a bet **title**, filed under Top Finisher. The five are
pinned in code now, `validateSheet()` drops the parameter so no caller can widen
the set, and a missing canonical row stops an import rather than resolving a
`category_id` to `undefined`.

**Verified locally:** `npm test` (528 pass, up from 523) · `npx tsc --noEmit` ·
`npm run lint` · `npm run build` · `bash scripts/dry-run-verify.sh` end to end,
pool unchanged at $425 − $32 = **$393**, which is the check that proves a
presentation change stayed one.

**`npm run test:e2e` ran this time** — 73 passed, 8 failed. The three new filter
specs pass. **All 8 failures reproduce identically on `main`** (70 passed, same 8
names, from the same freshly-reset database), so none is a regression: they are
this sprint's own residue, #201 — specs written when Docker was unavailable and
therefore never executed. Filed separately; not fixed here.

### The sabotage check, again

Sprint 26 recorded that its fixture had phase and status perfectly correlated,
which would have let a no-op rewrite pass. The same trap exists one level down:
if every round held exactly one category, filtering by round and filtering by
category would be the same operation on the fixture. `bet-filters.test.ts` now
guarantees a round holding two categories **and** a category spanning two rounds,
and was proven able to fail — dropping the category predicate reddens three
tests, the round predicate three, the phase five.

### Residue

- The filter is still client `useState`, so a selection is unshareable and dies
  on reload. Real gap, not Pat's ask, filed.
- Pat's optional "or at a particular time" is not honoured: `tournaments` has
  `phase1_closes_at` / `phase2_closes_at` and no *opens_at*, so there is no time
  to name without a schema change.
- The prod `bet_categories` table has not been inspected for the stray row that
  most likely put "Medalist" on Pat's screen — no prod credentials in the build
  session. Filed.
