# Sprint 9 — Polish & Group Dry Run (Phase 9)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** tournament-ready. Everything after this is reactive.
**Target:** Sept 1–10 (hard stop) · **Blockers:** Sprints 0–7 (8 is nice-to-have for the dry run).

- [x] Mobile pass on every page — the tournament happens on phones. *(Aug 9, 2026. Safe-area handling — `viewport-fit: cover` was never set, so every `env(safe-area-inset-*)` in the app resolved to 0 — the fixed footer stack, 44px targets on every control on the betting path, and the two widest tables stacked instead of parked behind a horizontal scroller. Proven by a Pixel 7 Playwright project, not by eye: 24 specs asserting no route overflows 412px, tap targets measured by where taps actually land, and one wager placed end to end with `tap()`. Before/after screenshots in [`../mobile/`](../mobile).)*
- [x] ~~**Group dry run:** recruit 5+ real participants and run the full cycle end to end~~ — **cut Sept 7, 2026** (Andrew). Not done, and not going to be: it is three days from the wrap date with Sprints 26–28 queued, and waiting on an event that keeps not happening was costing more than it protected. **Closed on substitute evidence**, all of which exists and is re-runnable: two full-lifecycle sessions with Pat against production (Jul 31 and September), 17 Playwright specs including `rules-gauntlet.spec.ts` firing the §7 rules through the real UI against real RLS, a 32-member synthetic pool replaying ~250 wagers through the real `validatePlacement()` and reconciling to within $0.02 (`npm run test:sim`), and `scripts/dry-run-verify.sh` walking the whole weekend in 64 checks. **What none of that covers, and what therefore went into the weekend untested:** ~5 real strangers signing in on their own phones at the same time — first-time onboarding by people who have never seen the app, concurrent load at a phase deadline, and the Resend delivery leg, which has been exercised exactly once ever. That risk is not absorbed silently; it is written into [`../PRE_TOURNAMENT_CHECKLIST.md`](../PRE_TOURNAMENT_CHECKLIST.md) as a soft-open step the week of. Related open work: [#137](https://github.com/andrewelong18/ozark-open/issues/137) prod export run, [#139](https://github.com/andrewelong18/ozark-open/issues/139) real iOS pass.
- [x] Fix everything the dry run surfaces. *(Both runs' findings are accounted for. The Jul 31 run's 21 became Sprints 21–25 and were **all shipped** by Aug 9, 2026 — the last was the avatar RLS P0 [#90](https://github.com/andrewelong18/ozark-open/issues/90), whose prod browser check carries on as [#145](https://github.com/andrewelong18/ozark-open/issues/145). The September run's four became Sprints [26](sprint-26.md)–[28](sprint-28.md) ([#193](https://github.com/andrewelong18/ozark-open/issues/193)–[#199](https://github.com/andrewelong18/ozark-open/issues/199)), plus the seed-script bug [#189](https://github.com/andrewelong18/ozark-open/issues/189). Coverage gaps [#110](https://github.com/andrewelong18/ozark-open/issues/110) closed Sept 7 — Sprint 19's Playwright suite covered them, which was that issue's own recommendation. Stakeholder questions [#111](https://github.com/andrewelong18/ozark-open/issues/111) narrowed to four that still need Pat.)*
- [x] Pre-tournament checklist doc: what admins do the week of, day before, and each morning/night of the tournament (the PRD §8 itinerary as a checklist — including the four uploads). Must include: verify the Supabase project is awake, verify magic-link email works end-to-end, and run a DB export. *(Aug 9, 2026 — [`../PRE_TOURNAMENT_CHECKLIST.md`](../PRE_TOURNAMENT_CHECKLIST.md), linked from the README's itinerary table and the CLAUDE.md doc map.)*
- [x] Data safety: CSV/`pg_dump` export **before Phase 1 opens** and **after final payouts** — free tier has no automated backups and this is money data. *(Aug 9, 2026 — [`scripts/db-export.sh`](../../scripts/db-export.sh) + the runbook at [`../DATA_SAFETY.md`](../DATA_SAFETY.md). Dump + CSVs + a manifest that carries the pool reconciliation, so an export self-verifies; refuses to exit 0 on an empty money table. Tested against the local stack and a PG16 cluster, including a dump→restore round trip. **Not yet run against prod** — needs the database password, which isn't in this environment (#137).)*
- [x] ~~Optional stretch (only if time): bet aggregate stats after close ("$48 wagered on Dan Mercer to win")~~ — **cut Sept 7, 2026** (Andrew). Optional by its own text, never started, ten days past the feature freeze. Nothing depends on it, and leaving it unticked was the last thing making this sprint read unfinished when it isn't.

**Done when:** the dry run completes without an admin needing to touch code or ask Andrew a question.

---

## Status

The **dry run half ran Jul 31, 2026** with Pat against production — full lifecycle, pool reconciled
to the cent ($425 − $32 = $393), 21 findings that became Sprints 21–25. Record in
[`../dry-run/ISSUE_LOG.md`](../dry-run/ISSUE_LOG.md).

The **polish half shipped Aug 9, 2026** — the mobile pass, the pre-tournament checklist, and the
data-safety export.

A **second session with Pat ran in September 2026**, again against production, again the full
lifecycle. It produced four asks and one seed-script bug, which became Sprints
[26](sprint-26.md)–[28](sprint-28.md) and
[#189](https://github.com/andrewelong18/ozark-open/issues/189). It has no `ISSUE_LOG` of its own —
the record is the scoping commit and issues
[#193](https://github.com/andrewelong18/ozark-open/issues/193)–[#199](https://github.com/andrewelong18/ozark-open/issues/199).

---

## Closed — Sept 7, 2026

**Say the honest thing first: the "Done when" above was not met.** It reads *"the dry run completes
without an admin needing to touch code or ask Andrew a question"*, and on the September night
Andrew pasted a patched `20-phase1-placements.sql` because the seed's cleanup predicate was wider
than the eight bettors it inserts ([#189](https://github.com/andrewelong18/ozark-open/issues/189)).
An admin touched code. This sprint is **closed by decision, on substitute evidence** — not because
its acceptance test passed.

**Why close it anyway.** The group run had been the one open item for five weeks and had already
cost real scope: Sprint 14 was cut in part because *"it is past the Aug 28 feature freeze with the
group dry run still unrun."* With three days to the wrap date and Sprints 26–28 queued, an event
that keeps not happening is no longer protecting anything — it is just making a finished app read
as unfinished across fourteen issues and five documents.

**What stands in its place**, all of it re-runnable rather than remembered:

| Evidence | What it proves |
|---|---|
| Two full-lifecycle sessions with Pat against **production** (Jul 31, September) | The weekend works end to end with an admin driving, and the pool reconciles to the cent |
| `npm run test:e2e` — 17 Playwright specs | The member journey in a real browser through real RLS, including `rules-gauntlet.spec.ts`, which fires the §7 rules — the exact browser coverage [#110](https://github.com/andrewelong18/ozark-open/issues/110) was filed to demand |
| `npm run test:sim` — 32 members, ~250 wagers | The split reconciles at full field size, every wager replayed through the real `validatePlacement()` |
| `bash scripts/dry-run-verify.sh` — 64 checks | The whole weekend in about a minute, ending "The whole dry-run script passes end to end" |

**What went into the tournament untested, stated plainly rather than absorbed:** ~5 real strangers
signing in on their own phones at the same time. Concretely — first-time onboarding by people who
have never seen the app, concurrent wagering at a phase deadline, and the **Resend delivery leg**,
which has been exercised exactly once in the project's life and which ~32 people hit on one
evening in September.

That risk is now an operational one rather than an open checkbox. It lives in
[`../PRE_TOURNAMENT_CHECKLIST.md`](../PRE_TOURNAMENT_CHECKLIST.md) as a **soft-open** step the week
of — publish the menu, message the group, then watch the first real sign-ins land and confirm out
of band that the magic links arrived — plus the iOS pass
([#139](https://github.com/andrewelong18/ozark-open/issues/139)) as a named day-before step and a
short "if members can't sign in" answer.

**Residue, carried not closed:** [#137](https://github.com/andrewelong18/ozark-open/issues/137)
(run `db-export.sh` against prod — needs the database password),
[#139](https://github.com/andrewelong18/ozark-open/issues/139) (the iOS pass),
[#189](https://github.com/andrewelong18/ozark-open/issues/189) (the seed-script bug), and the four
questions still open on [#111](https://github.com/andrewelong18/ozark-open/issues/111) — Devin's
shortfall, cents over Venmo, the entry-collection mechanism, and the missing Non-Goals content.
Three of the original seven closed the same day: Steve Esswein's zero-wager case, the participant
leaderboard, and the Sept 24–26 dates. See `../OUTSTANDING_DECISIONS.md`.
