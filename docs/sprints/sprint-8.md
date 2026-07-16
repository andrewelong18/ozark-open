# Sprint 8 — Leaderboard Mirror (Phase 8)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** live standings from the scoring workbook, read-only.
**Target:** late August (feature freeze Aug 28) · **Blockers:** Pat creating the Sheets mirror. *(Q15 resolved: one "Leaderboard" tab — player, thru, score, position — updated after each day.)*

- [ ] Pat mirrors the workbook to a Google Sheet with the agreed "Leaderboard" tab (his task; format settled in PRD §12 Q15).
- [ ] Google Cloud service account with read-only Sheet access; creds in Vercel env vars.
- [ ] `/leaderboard` page: fetch via Sheets API, cache 5 minutes, render the table.

**Done when:** standings appear in the app within 5 minutes of Pat editing the workbook.
