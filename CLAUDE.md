# Ozark Open Sportsbook — Context for Claude Code

Private fantasy-golf betting platform for the annual Ozark Open (Sept 24–26, 2026; app wrapped by Sept 10). Pari-mutuel pool — no house, no rake, no profit. ~32 participants, strictly behind login. Vibe-coded weekend project: prefer the simplest thing that works; no abstraction layers or future-proofing the docs don't ask for.

## Stack (decided — don't relitigate; rationale in docs/ARCHITECTURE.md §2)

Next.js 15 (App Router) + TypeScript · Supabase (Postgres, magic-link auth, RLS) · Vercel (auto-deploy from `main`) · Tailwind + shadcn/ui · Google Sheets API (read-only leaderboard)

## Doc Map — read only what the task needs

| Doc | Read when |
|---|---|
| `docs/sprints/sprint-N.md` | **The first read for "start sprint N."** One self-contained file per sprint: goal, reads, blockers, checkboxes, done-when. Work happens here. |
| `docs/ROADMAP.md` | The dashboard — timeline, sprint index, per-phase status, completed work. Read for "where are we?" and to flip status when a sprint ships. Slim by design; don't read it just to start a sprint. |
| `docs/PRD.md` | Bet rules (§7, §8.1), pari-mutuel math (§5), lifecycle & ingestion (§8), resolved stakeholder decisions (§12). |
| `docs/adr/0001-bet-pick-architecture.md` | The betting-structure decision record: bets→picks, phases, five categories, spreadsheet upload, void semantics. Read when a spec question smells architectural. |
| `docs/DATA_MODEL.md` | Touching schema, migrations, RLS, or the payout view. |
| `docs/ARCHITECTURE.md` | Auth flow, RLS strategy, where the math lives. |
| `docs/OUTSTANDING_DECISIONS.md` | Before building anything touching non-player limits, entry collection, or the items Pat's Jul 11 review left open — the still-open calls live here. |
| `docs/DESIGN_SYSTEM.md` | How the brand's visual system is wired into the app (tokens, fonts, ports). The `ozark-open-design` skill (`.claude/skills/ozark-open-design/`) is the visual source of truth. |
| `README.md` | Local setup, deploy, the admin workflow (spreadsheet upload + Studio). |

Do **not** re-read all foundation docs by default — each `docs/sprints/sprint-N.md` cites the sections it depends on; read those and start.

## Sprint Workflow ("start sprint N")

1. **Plan.** Read `docs/sprints/sprint-N.md` (self-contained) plus only the `docs/PRD.md`/`docs/DATA_MODEL.md` sections it cites — you should not need the whole `docs/ROADMAP.md` to start. Verify the sprint's blockers are cleared and the prior sprint's "Done when" holds if it's a dependency (read that blocker's `sprint-*.md` if needed). Plan exactly what the sprint's checkboxes list — no scope creep; anything extra becomes a GitHub issue, not work.
2. **Build.** One commit per checkbox-sized task, in checkbox order where dependencies allow. Schema changes only via new files in `supabase/migrations/`.
3. **Verify.** The sprint's **"Done when"** line is the acceptance test. Run it (or the closest local approximation — `npm run build`, unit tests, manual flow) before claiming done. Report failures plainly.
4. **Ship & update status — same commit series, never skipped.** Check off completed tasks in `docs/sprints/sprint-N.md`, then in `docs/ROADMAP.md` flip the sprint's row in the Sprint Index **and** its phase row in the Status Summary (🔲 → 🔶 → ✅) with the date, adjusting target dates if the schedule moved. Both must reflect reality the moment a sprint ships.
5. **Log leftovers as GitHub issues** — never as chat notes or code TODOs:
   ```
   gh issue create -R andrewelong18/ozark-open --title "Sprint N: <thing>" --body "<context + exact steps>"
   ```
   File one issue per item for: bugs found but not fixed, manual steps a human must do outside the repo (Supabase Studio data entry, Vercel/Supabase dashboard config, Resend setup, DNS, asking Pat/Jake something), and out-of-scope discoveries. Title prefix `Sprint N:`; body must be self-contained.

## Project Conventions

- **Migrations only.** Schema changes are SQL files in `supabase/migrations/`; Supabase Studio edits data, never schema.
- **The bet menu arrives by spreadsheet upload** (`/admin/import`, upsert by the sheet's `bet_id`/`pick_id` — ADR 0001). Studio is the admin CMS for everything else; the only custom admin UI in v1 is that upload page plus the read-only `/admin/view` View-sheet replica (Sprint 7).
- **The app never adjudicates a bet.** Results (hit/miss/push/void) are computed in the admin's Excel workbook and uploaded per pick. Don't build resolution logic.
- **Odds display values come from the sheet** (`fractional_odds`, `probability`, `total_probability` — verbatim, never recomputed). `american_odds` is for payout math only.
- **Validation is server-side** in `lib/validation.ts`, called from API routes. Client checks are UX, not security.
- **Payout math:** `placement_payouts_view` computes theoretical payouts **from `odds_at_placement`** (snapshotted at write — never the live pick odds) against each **pick's** result; `lib/payouts.ts` does the proportional split at render with a void-adjusted pool (pool = entry fees − voided stakes).
- **Rule parameters live on the `tournaments` row** — never hardcode entry-fee bounds, pick counts, or caps.
- **Placements are soft-deleted** (`deleted_at`) and odds-snapshotted; money rows keep their history.
- **The PRD §7 bet rules, the five-category pick rules (PRD §6), and the §12 decision log (incl. ADR 0001's A1–A10) are settled.** Don't relax, reorder, or reinterpret them without asking.
- **Docs beat code.** When they disagree, flag the drift — don't silently align to the code.

## Out of Scope (don't propose)

Scoring/skins/leaderboard math (stays in the Excel workbook) · bet resolution logic (results come from the admin's workbook per pick — ADR 0001) · payments (Venmo, out of band) · public access, SEO · custom admin UI beyond `/admin/import` + `/admin/view` · notifications · multi-tenancy · parlays, live odds, cash-out, real-time updates · new bet categories without a code change (by design)
