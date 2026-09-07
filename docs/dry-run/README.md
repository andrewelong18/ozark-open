# Dry Run

Everything needed to run the full tournament-weekend rehearsal in one evening — Sprint 9's
"group dry run", scaled down to two people plus a simulated pool.

> **Final state — closed Sept 7, 2026.** This rehearsal ran **twice** against production, both
> times Andrew + Pat: **Jul 31, 2026** (record in [`ISSUE_LOG.md`](ISSUE_LOG.md) — full lifecycle,
> pool reconciled to the cent at $425 − $32 = $393, 21 findings → Sprints 21–25) and again in
> **September 2026** (four asks → Sprints 26–28, issues #193–#199, plus the seed-script bug #189;
> no `ISSUE_LOG` of its own — the scoping commit and those issues are the record).
>
> Sprint 9's **group** run — 5+ real participants on their own phones — was **cut, not run**
> ([`../sprints/sprint-9.md`](../sprints/sprint-9.md) § Closed). Nothing here is scheduled any
> more. The material stays because it is still the best rehearsal harness in the repo: run
> `bash scripts/dry-run-verify.sh` any time you want the whole weekend re-proved in a minute, and
> the GAMEPLAN's unticked boxes are a script nobody is coming back to rather than work outstanding.

| File | Read when |
|---|---|
| **`GAMEPLAN.md`** | **Start here.** The checkbox script for the session: 12 acts, tiered P0/P1/P2, with the reasoning behind each test. |
| `PAT_PREP.md` | Send to Pat beforehand — what he brings, what he decides. |
| `ISSUE_LOG.md` | Open in a second window during the session. Capture template plus the paste-back-to-Claude workflow. |
| `sheets/` | Fallback spreadsheets, one per lifecycle stage, plus a deliberately broken one. Used only if Pat's own workbook isn't ready. |

## Supporting pieces

**SQL** in `supabase/dry-run/`, run in numeric order:

| File | When |
|---|---|
| `00-reset.sql` | Before the session — rewind to opening night |
| `10-accounts.sql` | Before the session — create the twelve simulated accounts |
| `20-phase1-placements.sql` | Act 3, right after the first upload |
| `25-phase1-handdriven-fallback.sql` | Only if Act 4 runs out of time |
| `30-phase2-placements.sql` | Act 8, right after Phase 2 opens |
| `35-phase2-handdriven-fallback.sql` | Only if Act 8 runs out of time |
| `90-teardown.sql` | After the session |

**Scripts:**

- `scripts/dry-run-verify.sh` — rehearses the entire evening against a throwaway Postgres and
  prints the payout table the session should land on. Run this before touching production.
- `scripts/make-dry-run-sheets.ts` — regenerates `sheets/` from `docs/import/bets-sample.xlsx`.

## The one-line version

```bash
bash scripts/dry-run-verify.sh    # then follow GAMEPLAN.md
```
