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
- **Display names.** ✅ **Resolved Jul 19, 2026 (PRD §12 A11, Sprint 15).** Rather
  than pick between user-set (Pat, Jul 11) and admin-set (Q13), Sprint 15 keeps
  `display_name` **admin-set** — it feeds import name-matching (ADR 0001 §11) — and
  gives users a **separate cosmetic `nickname`** (plus an avatar) they set on
  `/profile`. Import name-matching is untouched; the user still gets self-serve
  identity. Nothing further needed here.
- **Per-user betting toggle + non-player cap.** Pat (Jul 11): admins can
  enable/disable betting per user (`betting_enabled` on `tournament_participants`)
  and non-players carry a stricter max (see #2). Neither is in the Jul 15 schema;
  add in the Sprint 1 rework migration if confirmed.

## 2. Stricter betting maximum for non-playing bettors
**Owner:** Pat + Jake · **Blocks:** the non-player path in `lib/validation.ts` (Sprint 3).

Pat: non-playing participants "should have a stricter betting max limit." No number
or formula was given. Need: the actual cap (a flat dollar amount? a lower
`max_single`/`max_self`? a lower entry ceiling?) and whether it's a per-tournament
param or a per-participant override.

**Decided so far:** non-players are supported (any number; expect 0–5), exempt from
the self-bet rule (Q14).

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
