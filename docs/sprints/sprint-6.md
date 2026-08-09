# Sprint 6 — Results & Closed-Bet Views (Phase 5)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** closing a phase and uploading results is a non-event for Pat, and the app tells the story.
**Reads:** PRD §8 (itinerary, gating) · ADR 0001 §§5–6.
**Target:** ~Aug 16 · **Blockers:** Sprints 2 + 4.

- [x] When a bet is `closed`: placement inputs disappear; **everyone's placements** render on the bet — who took which pick, for how much (PRD §12 Q11/Q12; the social heart of the pool).
- [x] Per-pick result badges with color coding, shown **only when result ≠ `pending`**; a bet whose picks are all resolved reads visually as settled ("resolved" is derived — never stored).
- [x] Rewrite the README admin runbook around the two-track workflow: spreadsheet upload for bets/statuses/results (close a phase = flip `status` in the sheet and re-upload; enter results = fill `result` and re-upload) + Studio for users/participants/fixes, with screenshots. *(Runbook text complete; the screenshots issue [#29](https://github.com/andrewelong18/ozark-open/issues/29) is closed.)*
- [ ] Walk Pat through one simulated Thursday night: close Phase 1 via upload, then upload results, unaided. *(Human work — [#30](https://github.com/andrewelong18/ozark-open/issues/30), still open. Every prod prerequisite it was waiting on has since cleared: #12, #15, #22, #28 are all closed. **Substantially overtaken by events** — Pat drove the whole lifecycle, including a close-by-upload and two results uploads, in the Jul 31 dry run ([`../dry-run/ISSUE_LOG.md`](../dry-run/ISSUE_LOG.md)). What #30 still holds is the unaided part.)*

**Done when:** Pat takes a fake day-1 result sheet, re-uploads it in a few minutes unaided, and the app shows every pick's result and everyone's wagers on reload. *(Code half verified locally — unit tests + build + lint, and since Sprint 19 the reveal is driven end to end by `e2e/results-and-reveal.spec.ts`, which is what caught it being **dead** for two sprints under PGRST201. Browser half [#31](https://github.com/andrewelong18/ozark-open/issues/31), Pat half [#30](https://github.com/andrewelong18/ozark-open/issues/30) — both still open.)*
