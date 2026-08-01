# Dry Run — Issue Log

**Session:** 2026-07-31, started 5:30 PM  ·  **Driver:** Pat  ·  **Navigator:** Andrew

Keep this open in a second window for the whole session.

---

## The rule

**Never fix code during the session.** A fix invalidates everything tested before it and eats the
evening. Log it and keep moving. Everything here gets filed as a GitHub issue afterwards.

## How to capture

**During an act** — say it out loud, Navigator types one line into the scratch pad below, nobody
stops:

```
[4.7][P0] expected the self-cap error at $6, it accepted the wager
```

Format: `[act.step][tier] expected X, got Y`. Ten seconds, no more.

**At the next natural pause** (end of an act, while a spreadsheet uploads) turn each scratch line
into a table row while it's still fresh. The table is what gets filed; the scratch pad is just so
nobody has to stop mid-click.

## Tiers

| Tier | Means | Filed as |
|---|---|---|
| **P0** | September doesn't happen until this is fixed | Blocker, fix this week |
| **P1** | Should be fixed before the Sept 10 wrap | Normal issue |
| **P2** | Polish, edge case, or a nice-to-have | Backlog |

If you can't agree on a tier in five seconds, mark it **P1** and settle it in Act 12's triage.

## What makes a good row

The person fixing this will be reading it cold, possibly weeks later, without the session in
their head. Two things matter most:

- **Repro** — the exact account, the exact amount, the exact pick. "Dan Mercer, $6 on Win
  Tournament → Dan Mercer" is fixable; "the self-bet thing" is not.
- **Expected vs actual** — say what you thought would happen. Half the value of the log is
  catching the cases where the app was right and the expectation was wrong.

Screenshot anything visual. Paste the exact error text, don't paraphrase it.

---

## Scratch pad

_Fast capture. Messy is fine._

```
[0.5][P1] dev-magiclink.ts emits legacy /auth/v1/verify link -> callback says
  "Login link was missing its token." Needs token_hash shape.
[1.4/2.2][P2] gameplan orders these before Act 3, but 00-reset hides every
  bet, so /bets is empty for everyone. Both checks unverifiable as ordered.
[2.2][P2] empty state "No bets published yet / The book opens when an admin
  publishes the menu" reads well — no change needed, just re-order the test.
```

---

## Issues

| # | Act | Tier | What should have happened | What actually happened | Repro | Shot? |
|---|---|---|---|---|---|---|
| 1 | 0.5 | P1 | `scripts/dev-magiclink.ts` mints a working login link | Prints `properties.action_link` — the legacy `/auth/v1/verify?token=` URL, which returns the session as a hash fragment a server route can't read. `/auth/callback` correctly rejects it: *"Login link was missing its token. Request a new one."* | Run the script per Appendix B, open the link. Fix: emit `{SITE_URL}/auth/callback?token_hash=<properties.hashed_token>&type=magiclink` | — |
| 2 | 1.4 / 2.2 | P2 | The gameplan's ordering is runnable as written | Both steps assume the menu is visible, but `00-reset.sql` sets all 19 bets to `hidden`, so `/bets` is empty for every account until Act 3.1's upload. "Menu visible, no stake inputs" (1.4) and "stake inputs have appeared" (2.2) can't be checked when the doc says to check them. The empty state itself reads well and needs no change. | Reset → approve anyone → `/bets`. Fix: move both checks to just after 3.1 | — |
| 3 | 4.18 | **P1** | `25-phase1-handdriven-fallback.sql` fills in partially-placed slates | Fails with `duplicate key value violates unique constraint "bet_placements_user_id_pick_id_key"`. Its `wiped` CTE deletes in the same statement as the INSERT, so both see one snapshot and the delete isn't visible to the insert. It therefore only works on bettors with **no** existing Phase 1 rows — the opposite of the documented "Act 4 has eaten its time box" case. | Place any Phase 1 wager by hand as Dan Mercer, then run the file. Fix: make the DELETE its own statement before the INSERT. Same latent issue likely in `35-phase2-handdriven-fallback.sql`. | — |
| 4 | 2.3 | P2 | The gameplan says to restore the entry fee after the bounds test | It doesn't. Casey Sideline was left at **$35** after the `$35 → accepted` step, which silently breaks 4.6's cap case (at $35 his max is $17, not $20) and Appendix A's reconciliation. Caught only because the DB was checked directly. | Run 2.3 against Casey, then 4.6. Fix: add an explicit "set it back to $50" checkbox to 2.3, or tell testers to use a bettor not referenced later | — |
| 5 |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |
| 8 |  |  |  |  |  |  |
| 9 |  |  |  |  |  |  |
| 10 |  |  |  |  |  |  |
| 11 |  |  |  |  |  |  |
| 12 |  |  |  |  |  |  |
| 13 |  |  |  |  |  |  |
| 14 |  |  |  |  |  |  |
| 15 |  |  |  |  |  |  |

---

## Decisions Pat made

The dry run walks straight into five questions that have been blocking work. Capture the answer
in Pat's own words — a decision that only exists in someone's memory isn't a decision.

| Question | Surfaces at | Pat's answer |
|---|---|---|
| **The 5–10 span** — per phase (what the code does today) or per tournament (what Pat said in July)? | Act 4.17 |  |
| **The non-player cap** — Pat asked for a stricter maximum for non-playing bettors and never gave a number. Today there is no stricter limit at all. What is it? | Act 4.8 |  |
| **Entry collection** — is "$20 from the deposit, the remainder by Venmo" firm? | Act 12.1 |  |
| **Tournament dates** — Sept 24–26 confirmed? An earlier draft said 24–27. | Act 12.1 |  |
| **"Non-Goals — see word doc for more"** — the referenced document has no such section. What was meant? | Act 12.1 |  |
| **The participant leaderboard** — Pat suggested dropping it in July. Still his view? If so, Sprint 8 and the whole Google Sheets integration can be cut. | Act 11.1 |  |
| **Steve Esswein's case** — someone pays the entry and never places a wager. Their money funds the pool and they get $0 back. Is that right? | Act 10.2 |  |
| **Devin Arand's case** — someone is $2 short of their entry at Phase 2 close and isn't answering. Bets stand as-is? | Act 9.1 |  |
| **Cents** — payouts show cents. How does that get paid over Venmo? | Act 10.4 |  |

---

## Things that went right

Worth recording too — it's the evidence that flips a sprint from 🔶 to ✅ in `docs/ROADMAP.md`,
and it stops the same ground being re-tested in September.

- [ ] Magic-link login worked end to end, and the email arrived in ______ seconds
- [ ] A new member onboarded and set their own display name unaided
- [ ] Pat approved someone and they could bet immediately
- [ ] Entry fee bounds held ($15, $60 and $22.50 all rejected)
- [ ] The spreadsheet upload was idempotent — re-uploading reported zero changes
- [ ] The broken file was rejected whole; not one row landed
- [ ] Every §7 rule fired with a comprehensible message
- [ ] The $25-entry floor held: $13 rejected, $12 accepted
- [ ] The opponent block worked, including on a stroke-suffixed label
- [ ] Removing and re-placing revived the same row instead of creating a second
- [ ] Wagers stayed private while the phase was open
- [ ] Closing a phase revealed everyone's wagers
- [ ] Repricing a line left every existing wager's odds untouched
- [ ] Results uploaded partially, then completely, without trouble
- [ ] Void behaved differently from push, and the pool shrank by the voided stakes
- [ ] Phase 2 opened alongside a closed, revealed Phase 1, with budgets carried over
- [ ] The compliance query found the straggler
- [ ] **The payout numbers matched Pat's workbook to the cent**
- [ ] Everything usable on a phone

---

## After the session

- [ ] `supabase/dry-run/90-teardown.sql` has been run and verified
- [ ] Every scratch line has become a table row
- [ ] Paste the Issues table into Claude Code: **"file these as GitHub issues"**
      (they'll be titled `Sprint 9: …`, one per row, each self-contained)
- [ ] Pat's answers copied into `docs/OUTSTANDING_DECISIONS.md`
- [ ] `docs/ROADMAP.md` updated — Sprint 9's row and every phase this session actually verified
