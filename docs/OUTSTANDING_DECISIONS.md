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
| **#2 — stricter cap for non-playing bettors** | **No stricter limit** — same min and max rules as players. Marked resolved below; no code change. |
| **The 5–10 pick span** (was: per phase, or per tournament?) | **Minimum 5 across the whole tournament; maximum 10 per phase.** The minimum is only evaluated before Phase 2 close. This *is* a code change — schema, `checkPhaseMinimums()`, the chase query, PRD §7/§8.1 and ADR 0001 all move together. |
| **Do published lines ever move?** | **Never.** The lifecycle sheets were regenerated so they no longer carry a reprice (`24ea20a`). The odds-snapshot rule stays in the code regardless — correcting a typo means re-uploading, which is a reprice whether or not it was intended. |
| **Admin UI scope** | **Expanded** beyond `/admin/import` + `/admin/people` + `/admin/view`. Pat asked for a house-rules editor, admin-editable display names, and the ability to add a member and bet on their behalf. `CLAUDE.md` and the ROADMAP out-of-scope list are updated accordingly. |

Legend: **Owner** = who needs to decide · **Blocks** = what can't proceed until then.

---

## 1. Pat's July 11 review items not carried into the July 15 architecture rev
**Owner:** Pat + Jake (with Andrew) · **Blocks:** nothing today — but confirm before Sprint 3 (validation) locks the money rules.

The July 15 architecture rev (ADR 0001) is the current source of truth. Pat's
July 11 PRD review contained rulings that the rev did **not** adopt; each needs an
explicit confirm-or-supersede rather than a silent default:

- **5–10 bet-count span.** Pat (Jul 11): the 5–10 count spans the **whole
  tournament** ("all 5–10 in one round, zero in the other" is fine). Current docs
  (Jul 15): **min 5 / max 10 wagered picks per phase**, each pick counting
  individually. Confirm which span governs under the new phase structure —
  changes `lib/validation.ts` and the `tournaments` params (`min/max_picks_per_phase`
  vs `..._per_tournament`).
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
  **superseded Jul 20, 2026 (Sprint 16 / A12).** Rather than a `betting_enabled`
  column, betting eligibility is gated by whether a `tournament_participants` row
  exists, and admins grant/revoke it on `/admin/people` (approving creates the
  row). The **non-player stricter cap** (#2) is still open.

## 2. Stricter betting maximum for non-playing bettors — ✅ RESOLVED 2026-07-31
**Owner:** Pat · **Resolved in:** the full-lifecycle dry run, Act 4.8.

**Pat's answer: no stricter limit. Non-playing bettors get the same min and max
rules as players.**

Rationale, walked through with Casey Sideline (the $50 non-player in the simulated
pool): non-players already get identical entry-fee bounds, max single bet and pick
counts. The only rule they are exempt from is the self-bet cap (Q14), and that is
inapplicable rather than lenient — no pick in the menu bears a non-player's name, so
there is nothing for the cap to bind against.

**No code change.** The `is_player` exemption branch in `validateSelfBetTotal`
(`lib/validation.ts:156`) stays as-is; it is a correct no-op for non-players.

*(Original ask: Pat, July 11 — non-playing participants "should have a stricter
betting max limit", with no number or formula given.)*

## 3. Entry collection mechanism
**Owner:** Pat (+ tournament treasurer) · **Blocks:** nothing in the app (payments are out of band) — documentation accuracy only.

Pat: "I would say the minimum entry ($20) can be deducted from the deposit. Extra
should prolly be collected by other means (Venmo/Cash)." Phrased tentatively.
Confirm the split is firm so `PRD.md` §1/§10 and `README.md` state it correctly.
The app tracks no payment status regardless.

## 4. "Non-Goals — see word doc for more" (Pat §3)
**Owner:** Pat · **Blocks:** nothing — clarification only.

Pat's section-3 note points to the Word doc "for more," but the stakeholder-questions
doc contains no Non-Goals content (verified — no tracked comments, no such section).
The July 2026 architecture memo doesn't contain Non-Goals either. Ask Pat what he
intended to add so `PRD.md` §3 can capture it.

## 5. Tournament end date — confirm Sept 26 (was 24–27)
**Owner:** Pat · **Blocks:** nothing — factual accuracy.

The PRD/ROADMAP previously read "September 24–27"; corrected to **24–26** to match the
three-round structure (Round 1 Thu 24 · Round 2 Fri 25 · Round 3 Sat 26) and Pat's
own stakeholder-doc header ("September 24–26, 2026"). Confirm 26 is right — revert if
"27" was intentional (e.g., a travel/awards day).
