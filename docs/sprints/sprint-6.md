# Sprint 6 — Results & Closed-Bet Views (Phase 5)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** closing a phase and uploading results is a non-event for Pat, and the app tells the story.
**Reads:** PRD §8 (itinerary, gating) · ADR 0001 §§5–6.
**Target:** ~Aug 16 · **Blockers:** Sprints 2 + 4.

- [ ] When a bet is `closed`: placement inputs disappear; **everyone's placements** render on the bet — who took which pick, for how much (PRD §12 Q11/Q12; the social heart of the pool).
- [ ] Per-pick result badges with color coding, shown **only when result ≠ `pending`**; a bet whose picks are all resolved reads visually as settled ("resolved" is derived — never stored).
- [ ] Rewrite the README admin runbook around the two-track workflow: spreadsheet upload for bets/statuses/results (close a phase = flip `status` in the sheet and re-upload; enter results = fill `result` and re-upload) + Studio for users/participants/fixes, with screenshots.
- [ ] Walk Pat through one simulated Thursday night: close Phase 1 via upload, then upload results, unaided.

**Done when:** Pat takes a fake day-1 result sheet, re-uploads it in a few minutes unaided, and the app shows every pick's result and everyone's wagers on reload.
