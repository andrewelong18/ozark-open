# Dry Run — Issue Log

**Session:** _____________  ·  **Driver:** Pat  ·  **Navigator:** Andrew

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




```

---

## Issues

| # | Act | Tier | What should have happened | What actually happened | Repro | Shot? |
|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |
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
