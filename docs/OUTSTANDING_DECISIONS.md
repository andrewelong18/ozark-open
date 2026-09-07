# Outstanding Decisions

Decisions still genuinely open. Everything answered outright is folded into
`PRD.md` §12 (and, for the betting architecture, `docs/adr/0001-bet-pick-architecture.md`);
this file holds only the items that still need a stakeholder call before the
affected code can be built. Keep it short — resolve items here, then move the
decision into `PRD.md` §12 and delete the row.

**Resolved and removed on July 15, 2026:** the bet-taxonomy design meeting
(old #1) — Pat & Jake's architecture memo *is* its outcome, memorialized as
ADR 0001; and the void → pool math (old #3) — confirmed as
`pool = Σ entry fees − Σ voided stakes` (PRD §12 A7, ADR 0001 §9).

**Resolved in the July 31, 2026 full-lifecycle dry run with Pat** (see
`docs/dry-run/ISSUE_LOG.md` for the session record):

| Decision | Pat's answer |
|---|---|
| **#2 — stricter cap for non-playing bettors** | **No stricter limit** — same min and max rules as players. ✅ Folded into `PRD.md` §12 A15 on Aug 8, 2026 (Sprint 22); §2 below is now just a pointer. No code change. |
| **The 5–10 pick span** (was: per phase, or per tournament?) | **Minimum 5 across the whole tournament; maximum 10 per phase.** The minimum is only evaluated before Phase 2 close. ✅ Shipped Aug 8, 2026 (Sprint 22 / #96) — `tournaments.min_picks_per_tournament`, `checkPickMinimum()`, the chase query, PRD §7/§8.1 + §12 A14 and ADR 0001 §10 all moved together. |
| **Do published lines ever move?** | **Never.** The lifecycle sheets were regenerated so they no longer carry a reprice (`24ea20a`). The odds-snapshot rule stays in the code regardless — correcting a typo means re-uploading, which is a reprice whether or not it was intended. |
| **Admin UI scope** | **Expanded** beyond `/admin/import` + `/admin/people` + `/admin/view`. Pat asked for a house-rules editor, admin-editable display names, and the ability to add a member and bet on their behalf. `CLAUDE.md` and the ROADMAP out-of-scope list are updated accordingly. |

Legend: **Owner** = who needs to decide · **Blocks** = what can't proceed until then.

---

## 1. Pat's July 11 review items not carried into the July 15 architecture rev
**Owner:** Pat + Jake (with Andrew) · **Blocks:** nothing today — but confirm before Sprint 3 (validation) locks the money rules.

The July 15 architecture rev (ADR 0001) is the current source of truth. Pat's
July 11 PRD review contained rulings that the rev did **not** adopt; each needs an
explicit confirm-or-supersede rather than a silent default:

- **5–10 bet-count span.** ✅ **Resolved Jul 31, 2026 (PRD §12 A14, Sprint 22 / #96).**
  Pat's Jul 11 reading won, with a refinement: the **minimum of 5 spans the whole
  tournament** and is evaluated only before Phase 2 close, while the **maximum of 10
  stays per phase**. Shipped Aug 8, 2026 — `tournaments.min_picks_per_tournament`,
  `checkPickMinimum()` in `lib/validation.ts`, and `docs/admin/phase-compliance.sql`.
- **Participant leaderboard.** Pat (Jul 11): drop it (workbook stays the
  leaderboard's home; Sheets mirror repurposed for outcome entry). Current docs:
  leaderboard kept (Sprint 8, Google Sheets read-only). Note: results now arrive
  via the bets-spreadsheet upload, so if the leaderboard is dropped, the Google
  Sheets integration disappears entirely and Sprint 8 with it.
- **Display names.** ✅ **Resolved Jul 19 (A11, Sprint 15), refined Jul 20, 2026
  (PRD §12 A12, Sprint 16).** Sprint 15 kept `display_name` admin-set with a separate
  cosmetic `nickname`. Sprint 16 then lets a member set their own `display_name`
  **once** at required onboarding (guard permits it only while `onboarded_at IS NULL`);
  the **admin verifies/corrects it at approval**, so import name-matching (ADR 0001 §11)
  still only ever sees an admin-owned name. Nothing further needed here.
- **Per-user betting toggle + non-player cap.** The betting-toggle half is ✅
  **superseded Jul 20, 2026 (Sprint 16 / A12), refined Aug 7, 2026 (Sprint 21 /
  A13).** Rather than a `betting_enabled` column, betting eligibility is gated by
  whether a **live** `tournament_participants` row exists — one with
  `revoked_at IS NULL` — and admins grant/revoke it on `/admin/people`
  (approving creates or un-revokes the row; revoking stamps `revoked_at` and
  keeps it, so the entry fee survives). The **non-player stricter cap** (#2) is
  ✅ **resolved too** — no stricter limit (PRD §12 A15).

## 2. Stricter betting maximum for non-playing bettors — ✅ RESOLVED 2026-07-31, closed 2026-08-08

**Pat's answer: no stricter limit. Non-playing bettors get the same min and max
rules as players.** Recorded in `PRD.md` §12 A15 with the reasoning; nothing
further is open here, and per this file's own rule the decision now lives there.

No code change was needed: the `is_player` exemption branch in
`validateSelfBetTotal` (`lib/validation.ts`) is a correct no-op for non-players —
the self-bet cap is the one rule they are exempt from, and it is inapplicable
rather than lenient, since no pick in the menu bears a non-player's name.

## 2b. Four questions the Jul 31 dry run raised but didn't get to ask — **2 of 4 closed Sept 7, 2026**
**Owner:** Pat · **Blocks:** nothing, as of Sept 7 — both remaining items are policy calls that can
be made on the weekend itself.

Acts 9.1, 10.2, 10.4 and 11.1 weren't reached, so these went unasked. Tracked as
[#111](https://github.com/andrewelong18/ozark-open/issues/111). Two were still unanswered when
Sprint 9 was closed on **Sept 7, 2026**, and two were settled — one by what shipped, one by
Andrew's own call. Resolved rows are kept rather than deleted, because the record of *what was
asked* is half the value of this file.

1. **Devin Arand's case** — someone is $2 short of their entry at Phase 2 close and isn't
   answering. Bets stand? (Documented answer is Q3 — *whatever stands, stands* — but never
   confirmed aloud. Their full entry funds the pool while only part works for them; Devin
   finished the dry run at −$2.04, almost entirely from this.)
2. ~~**Steve Esswein's case** — someone pays the entry and never wagers. He appeared on the
   board at **$0.00 / −$20.00**. Is that what Pat wants when it's a real person?~~
   **✅ RESOLVED Sept 7, 2026 — settled by conduct, and reopenable in one line if Pat disagrees.**
   Two things changed the question. The **outcome** was already governed: PRD §12 Q3 says whatever
   stands, stands, and nothing in the app adjusts it. The **prevention** shipped Sept 2, 2026 as
   part of the launch-readiness pass — `buildComplianceSummary()` returned nothing at zero
   placements, so the member who had done the least was the only one the app told nothing; it now
   says what they still need. Pat has seen the $0.00 / −$20.00 row across two full dry runs
   without objecting. That is a weaker answer than his own words and is recorded as such.
3. **Cents** — payouts display to the cent. How does $29.03 get paid over Venmo? Decides
   whether to round or show a suggested-payment column.
4. ~~**The participant leaderboard** — Pat suggested dropping it in July. Still his view? If so,
   **Sprint 8 and the whole Google Sheets integration can be cut**, along with issues #66–#68.
   The single largest scope reduction available.~~
   **✅ RESOLVED Sept 7, 2026 (Andrew): keep it.** The largest available scope reduction was
   deliberately **not** taken. Sprint 8 stays ✅, `lib/leaderboard.ts` and `/leaderboard` stay
   built, and #66/#67/#68 stay open as residue. It remains **unlinked from the nav** (Andrew's
   call, Aug 23, 2026) and its Google service account (#66) is still unconfigured, so today it
   renders an empty state rather than standings — which is the documented expected result, not a
   bug (`docs/dry-run/GAMEPLAN.md`, landmine #4).

   **This row is about the Google Sheets mirror, and only that.** It has meant the Sheets board
   since Pat's July 11 note that the workbook stays the leaderboard's home, and §1 above uses the
   name the same way. The **bet-outcomes leaderboard** — the money standings that replace the
   dashboard's live modules once Phase 2 resolves — is a different board with different data, and
   it is Sprint [28](sprints/sprint-28.md) as already written (PRD §12 **A20**); Andrew confirmed
   on Sept 7, 2026 that it takes no new scope from this decision. Keeping both boards makes the
   name collision permanent and worth stating once: the golf board is mirrored from a Google Sheet
   tab named, literally, "Sportsbook Leaderboard", which is also what Pat calls the money
   standings — which is exactly why the money table ships as `lib/standings.ts` /
   `components/results/standings-table.tsx` under the heading "Final Standings", and why renaming
   that heading later must not rename those modules.

## 3. Entry collection mechanism
**Owner:** Pat (+ tournament treasurer) · **Blocks:** nothing in the app (payments are out of band) — documentation accuracy only.

Pat: "I would say the minimum entry ($20) can be deducted from the deposit. Extra
should prolly be collected by other means (Venmo/Cash)." Phrased tentatively.
Confirm the split is firm so `PRD.md` §1/§10 and `README.md` state it correctly.

**Still open, and narrowed (Sept 2, 2026).** The MECHANISM is Pat's call and this
entry stays open until he confirms it. What changed is that the app now **records**
collection without deciding it: `tournament_participants.paid_amount` / `paid_at` /
`paid_note` (migration `20260902000000`), edited on `/admin/people`, summarised there
and in an admin-only block on `/results`. `paid_note` is free text — "from the
deposit", "Venmo 9/2" — so the columns are true whichever way Pat lands.

Two rules make that safe to build ahead of the decision, and both are asserted by
`scripts/collection-roundtrip.ts`:

- **It is never an input to pool math.** The pool is Σ entry fees − Σ voided stakes
  (ADR 0001 §9) whether or not the money arrived. An unpaid member still funds the
  pool on paper — which is exactly why an admin needs to see the gap, and exactly why
  no payout calculation may read these columns. The round trip wipes every payment to
  zero and asserts `placement_payouts_view` is unchanged.
- **"Paid in full" is derived** (`paid_amount >= entry_fee`), never stored, so a
  partial payment needs no second source of truth.

So the line "the app tracks no payment status" is no longer true; the line that
replaces it is that the app tracks payment status and *acts on none of it*.

## 4. "Non-Goals — see word doc for more" (Pat §3)
**Owner:** Pat · **Blocks:** nothing — clarification only.

Pat's section-3 note points to the Word doc "for more," but the stakeholder-questions
doc contains no Non-Goals content (verified — no tracked comments, no such section).
The July 2026 architecture memo doesn't contain Non-Goals either. Ask Pat what he
intended to add so `PRD.md` §3 can capture it.

## 5. Tournament end date — confirm Sept 26 (was 24–27) — ✅ RESOLVED 2026-09-07
**Owner:** Pat · **Blocks:** nothing — factual accuracy.

The PRD/ROADMAP previously read "September 24–27"; corrected to **24–26** to match the
three-round structure (Round 1 Thu 24 · Round 2 Fri 25 · Round 3 Sat 26) and Pat's
own stakeholder-doc header ("September 24–26, 2026"). Confirm 26 is right — revert if
"27" was intentional (e.g., a travel/awards day).

**✅ RESOLVED Sept 7, 2026 — settled by conduct.** Sept 24–26 is now load-bearing in code that
Pat has driven twice: the phase-clock migration (`20260810000000_phase_clock.sql`) seeds Phase 1
closing **Thu Sept 24, 11:00 America/Chicago** and Phase 2 **Sat Sept 26, 11:00**, the PRD §8
itinerary and `PRE_TOURNAMENT_CHECKLIST.md` are built around those two mornings, and in September
Pat moved Round 2 to Lake Valley Golf Club — a change to the Friday of a Thu–Sat weekend, made
without questioning the weekend. Nobody has proposed a fourth day since July. Reopen only if Pat
says otherwise.
