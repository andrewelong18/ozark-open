# Sprint 9 — Polish & Group Dry Run (Phase 9)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** tournament-ready. Everything after this is reactive.
**Target:** Sept 1–10 (hard stop) · **Blockers:** Sprints 0–7 (8 is nice-to-have for the dry run).

- [x] Mobile pass on every page — the tournament happens on phones. *(Aug 9, 2026. Safe-area handling — `viewport-fit: cover` was never set, so every `env(safe-area-inset-*)` in the app resolved to 0 — the fixed footer stack, 44px targets on every control on the betting path, and the two widest tables stacked instead of parked behind a horizontal scroller. Proven by a Pixel 7 Playwright project, not by eye: 24 specs asserting no route overflows 412px, tap targets measured by where taps actually land, and one wager placed end to end with `tap()`. Before/after screenshots in [`../mobile/`](../mobile).)*
- [ ] **Group dry run:** recruit 5+ real participants and run the full cycle end to end — upload Phase 1 → place picks → close via re-upload → upload results → open Phase 2 via re-upload → final payouts. *(People, not code. The Jul 31 run with Pat covered the lifecycle with one admin driving; what's untested is ~5 strangers on their own phones at the same time. Related open work: [#137](https://github.com/andrewelong18/ozark-open/issues/137) prod export run, [#139](https://github.com/andrewelong18/ozark-open/issues/139) real iOS pass.)*
- [ ] Fix everything the dry run surfaces. *(The Jul 31 run's 21 findings became Sprints 21–25 and are shipped, bar the avatar RLS P0 [#90](https://github.com/andrewelong18/ozark-open/issues/90). This box stays open for the **group** run's findings, which don't exist yet. Stakeholder questions and coverage gaps it raised: [#110](https://github.com/andrewelong18/ozark-open/issues/110), [#111](https://github.com/andrewelong18/ozark-open/issues/111).)*
- [x] Pre-tournament checklist doc: what admins do the week of, day before, and each morning/night of the tournament (the PRD §8 itinerary as a checklist — including the four uploads). Must include: verify the Supabase project is awake, verify magic-link email works end-to-end, and run a DB export. *(Aug 9, 2026 — [`../PRE_TOURNAMENT_CHECKLIST.md`](../PRE_TOURNAMENT_CHECKLIST.md), linked from the README's itinerary table and the CLAUDE.md doc map.)*
- [x] Data safety: CSV/`pg_dump` export **before Phase 1 opens** and **after final payouts** — free tier has no automated backups and this is money data. *(Aug 9, 2026 — [`scripts/db-export.sh`](../../scripts/db-export.sh) + the runbook at [`../DATA_SAFETY.md`](../DATA_SAFETY.md). Dump + CSVs + a manifest that carries the pool reconciliation, so an export self-verifies; refuses to exit 0 on an empty money table. Tested against the local stack and a PG16 cluster, including a dump→restore round trip. **Not yet run against prod** — needs the database password, which isn't in this environment (#137).)*
- [ ] Optional stretch (only if time): bet aggregate stats after close ("$48 wagered on Dan Mercer to win").

**Done when:** the dry run completes without an admin needing to touch code or ask Andrew a question.

---

## Status

The **dry run half ran Jul 31, 2026** with Pat against production — full lifecycle, pool reconciled
to the cent ($425 − $32 = $393), 21 findings that became Sprints 21–25. Record in
[`../dry-run/ISSUE_LOG.md`](../dry-run/ISSUE_LOG.md).

The **polish half shipped Aug 9, 2026** — the three checkboxes above.

Still open, and both need people rather than code:

- The **group dry run** with 5+ real participants (the checkbox above), plus what it surfaces.
- The stakeholder questions and coverage gaps the July dry run raised: [#110](https://github.com/andrewelong18/ozark-open/issues/110), [#111](https://github.com/andrewelong18/ozark-open/issues/111).
- One pass on a **real iOS device** — the Pixel 7 project is Chromium, and it can't see Safari's
  keyboard behaviour, momentum scrolling, or a physical thumb: [#139](https://github.com/andrewelong18/ozark-open/issues/139).
