# Dry Run

Everything needed to run the full tournament-weekend rehearsal in one evening — Sprint 9's
"group dry run", scaled down to two people plus a simulated pool.

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
