# Sprint 9 — Polish & Group Dry Run (Phase 9)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** tournament-ready. Everything after this is reactive.
**Target:** Sept 1–10 (hard stop) · **Blockers:** Sprints 0–7 (8 is nice-to-have for the dry run).

- [ ] Mobile pass on every page — the tournament happens on phones.
- [ ] **Group dry run:** recruit 5+ real participants and run the full cycle end to end — upload Phase 1 → place picks → close via re-upload → upload results → open Phase 2 via re-upload → final payouts.
- [ ] Fix everything the dry run surfaces.
- [ ] Pre-tournament checklist doc: what admins do the week of, day before, and each morning/night of the tournament (the PRD §8 itinerary as a checklist — including the four uploads). Must include: verify the Supabase project is awake, verify magic-link email works end-to-end, and run a DB export.
- [ ] Data safety: CSV/`pg_dump` export **before Phase 1 opens** and **after final payouts** — free tier has no automated backups and this is money data.
- [ ] Optional stretch (only if time): bet aggregate stats after close ("$48 wagered on Dan Mercer to win").

**Done when:** the dry run completes without an admin needing to touch code or ask Andrew a question.
