# Sprint 8 — Leaderboard Mirror (Phase 8)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** live standings from the scoring workbook, read-only.
**Target:** late August (feature freeze Aug 28) · **Blockers:** Pat creating the Sheets mirror. *(Q15 resolved, revised Jul 21: one "Sportsbook Leaderboard" tab — Position, Player, Round 1 Points, Round 2 Points, Total Points, Starting Strokes, Round 3 Score, Final Score — updated after each day. The three to-par columns render with the sheet's `+0;-0;"E"` format.)*

- [x] Pat mirrors the workbook to a Google Sheet with the agreed "Sportsbook Leaderboard" tab (his task; done Jul 21 — keeping it populated each round is tracked as a GitHub issue).
- [ ] Google Cloud service account with read-only Sheet access; creds in Vercel env vars. *(Manual dashboard work — [#66](https://github.com/andrewelong18/ozark-open/issues/66), still open. It gates the prod acceptance check [#68](https://github.com/andrewelong18/ozark-open/issues/68) and the mobile restack check [#138](https://github.com/andrewelong18/ozark-open/issues/138); Pat keeping the tab populated each round is [#67](https://github.com/andrewelong18/ozark-open/issues/67).)*
- [x] `/leaderboard` page: fetch via Sheets API (`lib/leaderboard.ts`, `google-auth-library`), cache 5 minutes (`unstable_cache`), render the 8-column table with `+0;-0;"E"` to-par formatting; always-visible nav tab; behind login.

**Done when:** standings appear in the app within 5 minutes of Pat editing the workbook. *(Prod acceptance — verifiable once the service account is wired; tracked as [#68](https://github.com/andrewelong18/ozark-open/issues/68).)*
→ **Code complete Jul 21, 2026.** Everything in this repo is done and unit-tested; what's left
is one Google Cloud account and two Vercel env vars ([#66](https://github.com/andrewelong18/ozark-open/issues/66)),
which no amount of local work can substitute for.
