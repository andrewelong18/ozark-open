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
| 5 | 1.3 | **P0** | Uploading an avatar during onboarding succeeds | Fails with *"new row violates row-level security policy"*. The storage policies exist in prod (4 on `storage.objects`), the upload path `${userId}/avatar` matches `(storage.foldername(name))[1] = auth.uid()::text`, and `userId` is `user.id` from `getUser()` — so the obvious causes are ruled out and this needs a captured failing request. Same code in `components/onboarding/onboarding-form.tsx:70` and `components/profile/profile-form.tsx:69` | Onboard a new account, attach a photo, submit | — |
| 6 | 1.3 | P2 | — | **Feature:** crop the photo during upload, and allow removing an attachment before submitting if you don't like it | Same two components | — |
| 7 | 2.5 | **P0** | Revoking betting access leaves the entry fee recoverable; admin copy says "they drop out but their bets stay" | Entry fee went **$20 → $0**. `app/api/admin/participants/route.ts:160` DELETEs the participant row, so the fee is genuinely gone. **Money consequence:** placements survive the revoke, so a revoked bettor keeps wagers in the pool while their entry fee no longer funds it — `poolTotal()` (`lib/payouts.ts:86`) silently shrinks. Decide: soft revoke (`revoked_at`, row retained) vs. preserving the fee for re-approval | Approve someone at $20, revoke, re-approve | — |
| 8 | 4.3 | P1 | Betting $0 shows an error message | Correctly refused, but **silently** — no message. Server-side validation in `lib/validation.ts` is right; the client swallows the rejection. Other rejections do surface | `/bets` → any pick → enter `0` → confirm | — |
| 9 | 3.1 | P1 | A golfer's name and its profile link exclude the handicap | `(E)` / `(-10)` are rendered as part of the name and inside the link. Should be a small badge beside the name. The importer already strips exactly this suffix for player matching — reuse that regex so display and matching can't drift | Any Group Match or Match pick on `/bets` | — |
| 10 | 6.3 | **P0** | Uploading a results sheet whose bets are still marked `Open` is caught | Accepted silently. Pat uploaded a results-bearing file with `status = open`; the app published verdicts on a live book with no warning. **Two separate checks wanted:** (a) hard block — a non-closed bet carrying a result is invalid; (b) soft warning — a bet marked Open after its phase has closed, Pat confirms and proceeds | Upload any sheet with `status=open` and a non-pending `result` | — |
| 11 | 6.1 | P1 | The chase list points at who needs chasing | At Phase 1 close `docs/admin/phase-compliance.sql` flags **13 of 14 people** on `off_exact_total`, burying Devin Arand — the one real straggler. `off_exact_total` is only meaningful at Phase 2 close. This is Pat's only chase tool and he reads it on a phone at 7am | Run the query at Phase 1 close | — |
| 12 | 6.1 / 10.1 | **P0** | Pat can run the tournament without database access | Two time-critical moments have no UI at all: the chase list is SQL-only, and unlocking `/results` needs `UPDATE tournaments SET status='completed'`. Both currently route through Andrew. Needs controls, or a runbook Pat can follow unaided | — | — |
| 13 | 3.x | P1 | The dashboard badge reflects whether betting is actually open | Says **"Betting Open"** while `/bets` shows *"No bets published yet"*. `app/dashboard/page.tsx:119` derives it from `tournaments.status`, which does **not** gate betting (landmine #2). Wanted: per-phase open/closed indicators for Phase 1 and Phase 2, wired to a countdown | Reset the menu to hidden, load `/dashboard` | — |
| 14 | 4.x | P1 | — | **Rule change:** minimum **5 picks across both phases combined** (not per phase); maximum stays **10 per phase**; the minimum is only evaluated **before Phase 2 close**. Today `min_picks_per_phase` is enforced per phase, so betting in both phases forces ≥10 picks. Ripples: migration, `checkPhaseMinimums()` (`lib/validation.ts:257`), `phase-compliance.sql`, `/my-bets` banner, PRD §7/§8.1, ADR 0001, and the existing unit tests which encode the old rule | — | — |
| 15 | 2.x | P1 | — | **Feature:** admins can change a member's display name. The DB already allows it (`guard_users_self_update` exempts admins); only the `/admin/people` edit form lacks the field | — | — |
| 16 | 2.x | P1 | — | **Feature:** admins can adjust the house rules. All parameters already live on the `tournaments` row and are read via `TOURNAMENT_RULE_COLUMNS` / `toTournamentRules()`, so no hardcoded figures to hunt | — | — |
| 17 | 1.2 | P1 | — | **Feature:** for members who can't manage email, an admin can add them and place bets on their behalf. **Integrity requirements:** every §7 rule must evaluate against the *bettor*, not the acting admin (self-bet cap, opponent block, budget), and placements need an audit trail of who actually placed them | — | — |
| 18 | 6.x | P1 | — | **Feature:** schedule Phase 1 close for **Thu Sept 24 2026, 11:00 CT** and Phase 2 for **Sat Sept 26 2026, 11:00 CT**; let admins change those times, close a phase manually, and toggle whether members see the countdown. **Architecturally significant** — today a bet's status changes *only* via spreadsheet upload (ADR 0001, landmine #2); this adds two more mechanisms | — | — |
| 19 | 6.4 | P1 | — | **Feature:** on the reveal, don't list every bettor up front. Show a tertiary "x bettors" link per bet row that expands accordion-style and collapses again; collapsed by default | — | — |
| 20 | 3.1 | P1 | — | **Feature:** refactor the filters. One filter at a time; replace the All/Open/Closed triple (`components/betting/bets-menu.tsx:76`) with a binary open/closed toggle defaulting to open, falling back to closed when nothing is open. Too many filter patterns competing today | — | — |
| 21 | 3.1 | P2 | Picks within a bet render in a predictable order | `app/bets/page.tsx` fetches `bet_picks` with **no `ORDER BY` at any layer** — order is whatever Postgres returns, and an upsert that rewrites a row can reshuffle it. The comment above `groupBets` claims picks are ordered by sheet ID; they never were. `/my-bets` and `/admin/view` *do* sort by `sheet_pick_id`, so the menu is the odd one out. **Wanted:** sort by implied probability, favourites first. Written during the session as `e045a99`, then reverted (`bc9447f`) rather than ship an untested mid-session change | Any multi-pick bet on `/bets` | — |

---

## Decisions Pat made

The dry run walks straight into five questions that have been blocking work. Capture the answer
in Pat's own words — a decision that only exists in someone's memory isn't a decision.

| Question | Surfaces at | Pat's answer |
|---|---|---|
| **The 5–10 span** — per phase (what the code does today) or per tournament (what Pat said in July)? | Act 4.17 | **Minimum 5 across the whole tournament; maximum 10 per phase.** The minimum is only checked before Phase 2 close. |
| **The non-player cap** — Pat asked for a stricter maximum for non-playing bettors and never gave a number. Today there is no stricter limit at all. What is it? | Act 4.8 | **No stricter limit — same min and max rules as players.** Non-players already get identical entry-fee bounds, max single bet and pick counts; the self-bet cap is inapplicable because no pick bears their name. No code change; closes `OUTSTANDING_DECISIONS` §2. |
| **Do published lines ever move?** | Act 5 | **Never.** Act 5 skipped as a result, and the lifecycle sheets were regenerated so they no longer carry the reprice (`24ea20a`). |
| **Admin UI scope** — `CLAUDE.md` lists custom admin UI beyond import/people/view as out of scope, but items 15–18 all need it. | Debrief | **Scope expanded.** Update the `CLAUDE.md` line and the ROADMAP out-of-scope list. |
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
- [x] Void behaved differently from push, and the pool shrank by the voided stakes — verified
      in prod: entry fees **$425** − voided stakes **$32** = pool **$393**, 4 voided picks
      across both phases
- [x] Phase 2 opened alongside a closed, revealed Phase 1, with budgets carried over — every
      hand-driven bettor's remaining budget was exact ($15 / $10 / $20 / $12)
- [x] The compliance query found the straggler — Devin Arand flagged at 3 picks / $8 of $20,
      and he was the only `under_phase_minimum` in the pool
- [x] **The app's payout numbers matched the rehearsal to the cent** — production reproduced
      Appendix A exactly, all 14 rows (Casey $66.95 / +$19.95 through Steve $0.00 / −$20.00).
      Pool $425 − $32 = **$393**, and the Actual column sums to exactly $393. Ledger exported
      to `~/Desktop/ozark-dryrun-ledger-2026-07-31/` for Pat's workbook cross-check, which is
      still outstanding.

> **Live proof of finding 12 / issue #108.** The first ledger export was taken while 5
> placements sat on `pending` picks (something was uploaded to prod after the final close).
> The resulting payout table looked entirely plausible — Casey $67.04, Jake $33.26 — and was
> wrong by up to $10 a person, because `aggregatePayouts()` splits the whole pool across only
> the settled wagers. Nothing warned. This is the exact failure mode that makes the
> unguarded `status = 'completed'` flip dangerous.
- [ ] Everything usable on a phone

---

## What this session did NOT exercise

**The unticked boxes above are not failures — they are untested ground**, and the gameplan
asks that skipped tests be recorded rather than assumed. Two things drove the gaps: Act 4's
hand-driven slates were filled in by the fallback SQL (`25-…`/`35-…`) rather than placed in the
browser, and Acts 11–12 were not reached.

**The §7 money rules were never fired by hand.** They pass 186 unit tests and every seeded
wager validated cleanly, but the following were not exercised through the real UI — meaning the
error strings, the two-tap confirm, the toasts and the edit/remove/revive path are unverified
against a human:

- 4.5 the $25-entry **floor** ($13 rejected, $12 accepted) — the subtlest rule in the book
- 4.7 the **self-bet cap** across both phases
- 4.10 the **opponent block**, including on a stroke-suffixed label
- 4.13 **remove then re-place revives the same row** rather than creating a second
- 4.14 **privacy** — that no bettor can see another's money while a phase is open
- 3.3 upload **idempotency** and 3.4 the **broken file** (both verified in the local rehearsal,
  not in the browser)
- 1.2 the **magic-link email round trip** — the only test of Resend, and the flow all ~32
  people hit in September
- 11.2 the **mobile pass** — nearly everyone uses this app only from a phone

**Act 5 was skipped deliberately** (Pat: lines never move) and the reprice was removed from the
lifecycle sheets, so odds-snapshot integrity was never demonstrated live. The rule remains in
the code and is covered by `scripts/dry-run-verify.sh`.

Tracked as a Sprint 9 carryover — see the GitHub issue titled *"dry run coverage gaps"*.
`scripts/dry-run-verify.sh` reproduces the whole lifecycle locally in about a minute, so the
seeded half needs no second session; the browser half does.

---

## After the session

- [x] `supabase/dry-run/90-teardown.sql` has been run and verified — sim accounts 0 ·
      placements 0 · real accounts 3 · status `upcoming` · visible bets 0 · settled picks 0,
      with the 19-bet / 87-pick menu intact. The script was also **fixed** in the same pass:
      it reset the tournament row but left every bet closed and every pick carrying a verdict,
      so the menu stayed in the dry run's end state
- [x] Every scratch line has become a table row
- [x] Filed as GitHub issues — [#90–#109](https://github.com/andrewelong18/ozark-open/issues)
      for the 21 findings, plus [#110](https://github.com/andrewelong18/ozark-open/issues/110)
      (coverage gaps) and [#111](https://github.com/andrewelong18/ozark-open/issues/111)
      (the seven unasked questions)
- [x] Pat's answers copied into `docs/OUTSTANDING_DECISIONS.md` — four resolved, four new
      questions added as §2b
- [x] `docs/ROADMAP.md` updated — Sprint 9 flipped to 🔶 with the reconciliation result, and
      Sprints [21](../sprints/sprint-21.md)–[25](../sprints/sprint-25.md) indexed

---

## What's been fixed since (Sprint 21, Aug 7, 2026)

Five of the 21 rows are closed in code. The numbers below are this file's row numbers.

| Row | Finding | Status |
|---|---|---|
| 1 | `dev-magiclink.ts` emits the legacy verify link | ✅ Fixed — emits `…/auth/callback?token_hash=…&type=magiclink` ([#94](https://github.com/andrewelong18/ozark-open/issues/94)). One live run still owed ([#115](https://github.com/andrewelong18/ozark-open/issues/115)) |
| 2 | Acts 1.4 / 2.2 ordered before the menu exists | ✅ Fixed — both checks moved into Act 3.1, step numbers deliberately unchanged ([#109](https://github.com/andrewelong18/ozark-open/issues/109)) |
| 3 | The hand-driven fallback SQL fails when needed | ✅ Fixed in **four** files, not the two named — `20-` and `30-` carry the same pattern, and `20-`'s delete wasn't phase-scoped ([#95](https://github.com/andrewelong18/ozark-open/issues/95)). `dry-run-verify.sh` now runs each file twice to prove it |
| 4 | Act 2.3 never restores the entry fee | ✅ Fixed — 2.3 names Casey and makes restoring his $50 a step ([#109](https://github.com/andrewelong18/ozark-open/issues/109)) |
| 5 | Avatar upload fails with an RLS violation | ✅ Fixed Aug 8, 2026 (`3715725` — `lib/avatar.ts`), diagnosis corrected and browser-covered Aug 9 ([#90](https://github.com/andrewelong18/ozark-open/issues/90)). The "race against cookie hydration" explanation was wrong — supabase-js already awaits `getSession()` on every storage request — and the bucket policies were verified correct against production. `e2e/avatar-upload.spec.ts` now proves the upload end to end through real RLS. Row 6 (crop/remove) is unblocked |
| 7 | Revoking destroys the entry fee | ✅ Fixed as a soft revoke — `revoked_at`, the fee and the wagers now leave and return together ([#91](https://github.com/andrewelong18/ozark-open/issues/91), PRD §12 A13). Prod migration ([#113](https://github.com/andrewelong18/ozark-open/issues/113)) and browser round trip ([#114](https://github.com/andrewelong18/ozark-open/issues/114)) still owed |
| 8 | A $0 wager is refused silently | ✅ Fixed — every rejected stake reddens the input and toasts the reason ([#92](https://github.com/andrewelong18/ozark-open/issues/92)) |

Rows 9–21 belong to Sprints [22](../sprints/sprint-22.md)–[25](../sprints/sprint-25.md) and are untouched.
