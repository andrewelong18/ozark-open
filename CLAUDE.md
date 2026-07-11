# Ozark Open Sportsbook — Context for Claude Code

Private fantasy-golf betting platform for the annual Ozark Open (Sept 24–26, 2026; app wrapped by Sept 10). Pari-mutuel pool — no house, no rake, no profit. ~32 participants, strictly behind login. Vibe-coded weekend project: prefer the simplest thing that works; no abstraction layers or future-proofing the docs don't ask for.

## Stack (decided — don't relitigate; rationale in ARCHITECTURE.md §2)

Next.js 15 (App Router) + TypeScript · Supabase (Postgres, magic-link auth, RLS) · Vercel (auto-deploy from `main`) · Tailwind + shadcn/ui · Google Sheets API (read-only bet-outcome input; no participant leaderboard)

## Doc Map — read only what the task needs

| Doc | Read when |
|---|---|
| `ROADMAP.md` | **Always, for sprint work.** Status table + numbered sprint backlog. The single source of "where are we." |
| `PRD.md` | Bet rules (§7, §8.1), pari-mutuel math (§5), lifecycle (§8), resolved stakeholder decisions (§12). |
| `DATA_MODEL.md` | Touching schema, migrations, RLS, or the payout view. |
| `ARCHITECTURE.md` | Auth flow, RLS strategy, where the math lives. |
| `README.md` | Local setup, deploy, the admin Studio runbook. |
| `OUTSTANDING_DECISIONS.md` | Before building anything touching the bet taxonomy, non-player limits, void payout math, or entry collection — the still-open calls live here. |

Do **not** re-read all foundation docs by default — each sprint in `ROADMAP.md` cites the sections it depends on; read those and start.

## Sprint Workflow ("start sprint N")

1. **Plan.** Read the Sprint N section of `ROADMAP.md` plus only the PRD/DATA_MODEL sections it cites. Verify the sprint's blockers are cleared and the prior sprint's "Done when" holds if it's a dependency. Plan exactly what the sprint's checkboxes list — no scope creep; anything extra becomes a GitHub issue, not work.
2. **Build.** One commit per checkbox-sized task, in checkbox order where dependencies allow. Schema changes only via new files in `supabase/migrations/`.
3. **Verify.** The sprint's **"Done when"** line is the acceptance test. Run it (or the closest local approximation — `npm run build`, unit tests, manual flow) before claiming done. Report failures plainly.
4. **Ship & update status — same commit series, never skipped.** Check off completed tasks in `ROADMAP.md`, flip the phase row in the Status Summary (🔲 → 🔶 → ✅) with the date, and adjust target dates if the schedule moved. `ROADMAP.md` must reflect reality the moment a sprint ships.
5. **Log leftovers as GitHub issues** — never as chat notes or code TODOs:
   ```
   gh issue create -R riversteve/ozark-open --title "Sprint N: <thing>" --body "<context + exact steps>"
   ```
   File one issue per item for: bugs found but not fixed, manual steps a human must do outside the repo (Supabase Studio data entry, Vercel/Supabase dashboard config, Resend setup, DNS, asking Pat/Jake something), and out-of-scope discoveries. Title prefix `Sprint N:`; body must be self-contained. *(If Issues are still disabled on `riversteve/ozark-open`, file against `-R andrewelong18/ozark-open` and say so in the body.)*

## Project Conventions

- **Migrations only.** Schema changes are SQL files in `supabase/migrations/`; Supabase Studio edits data, never schema.
- **Studio is the admin CMS.** No custom admin UI in v1.
- **Validation is server-side** in `lib/validation.ts`, called from API routes. Client checks are UX, not security.
- **Payout math:** `placement_payouts_view` computes theoretical payouts **from `odds_at_placement`** (snapshotted at write — never the live bet odds); `lib/payouts.ts` does the proportional split at render.
- **Rule parameters live on the `tournaments` row** — never hardcode entry-fee bounds, bet counts, or caps.
- **Placements are soft-deleted** (`deleted_at`) and odds-snapshotted; money rows keep their history.
- **The bet rules (PRD §7) and the §12 decision log are the source of truth** (Jake's Jul 9 answers, revised by Pat Jul 2026). Don't relax, reorder, or reinterpret them without asking; genuinely open items are in `OUTSTANDING_DECISIONS.md`, not up for guessing.
- **Docs beat code.** When they disagree, flag the drift — don't silently align to the code.

## Out of Scope (don't propose)

Scoring/skins/leaderboard math (stays in the Excel workbook) · participant-facing leaderboard in the app · odds computation or suggestion (Pat & Jake hand-set all odds) · payments (Venmo/cash, out of band) · public access, SEO · custom admin UI · notifications · multi-tenancy · parlays, live odds, cash-out, real-time updates · new `resolution_type` values without a code change (by design)
