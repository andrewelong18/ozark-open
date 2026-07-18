# Competitive Analysis — Ozark Open vs. DraftKings / FanDuel

> A benchmark of the Ozark Open Sportsbook **app experience** against mainstream
> sportsbooks (DraftKings, FanDuel), written to be mined for future sprints.
> Added Jul 18, 2026. Not a spec — a menu of ideas with enough structure to turn
> the ones you like into `docs/sprints/sprint-N.md` files.

## How to use this doc

The guiding filter is **experience patterns, not new bet types.** The betting
*structure* is settled and locked (pari-mutuel, five pick categories, no parlays /
live odds / cash-out — see `PRD.md` §3, "how a weekend project dies"). Nothing here
proposes a new way to wager. What it borrows from DK/FanDuel is the *product layer*
around the wager: onboarding, bet-slip UX, discovery, reminders, social reveal,
trust, and delight — adapted to a private, ~32-person, login-only pool where
**everyone's bets going public at close is a feature, not a leak.**

Pick what you want, then either (a) drop a Tier 1 idea's stub (§5) into
`docs/sprints/` as the next Sprint 15+, or (b) fold a smaller idea into an existing
bonus sprint (8, 12, 14) as noted. Follow the roadmap's bonus-wishlist convention
(`ROADMAP.md`): these are enhancements, never MVP blockers, cut without ceremony if
they don't fit before the Aug 28 freeze.

## Scoring key

Each idea is tagged on three lenses:

- **Impact** — engagement / clarity payoff for a 32-person friend pool (Low / Med / High).
- **Effort** — build size (S ≈ an afternoon · M ≈ a sprint · L ≈ multi-sprint).
- **Scope-fit:**
  - ✅ **Fits today's model** — no settled decision reopened.
  - ⚠️ **Touches an open decision** — depends on an unresolved item in `OUTSTANDING_DECISIONS.md`; cited inline and in §6.
  - ⛔ **Would reopen a "permanently out" call** — listed only in §4's "deliberately not recommended," as a guardrail, never as a suggestion.

---

## 1. Feature-parity snapshot

How the two categories of thing compare. "N/A by design" = deliberately excluded and
staying that way.

| Theme | What DK / FanDuel do | Ozark today |
|---|---|---|
| **Onboarding & account** | Guided first bet, KYC, self-serve profile, preferences | **None** — no profile page; display name + registration set in Studio |
| **Bet-slip & placement UX** | Persistent slip, add-then-review, confirm step, payout preview | **Partial** — inline per-pick placement, immediate write, running total on dashboard; no review/confirm step, no receipt |
| **Discovery & menu** | Search, filters, favorites, featured/boosted, "popular" | **Partial** — grouped phase→round→category; no search/filter/jump |
| **My bets & tracking** | Open vs. settled tabs, live tracking, history | **Have** — `/my-bets` with running total + theoretical payout; no open/settled split, no cross-year history |
| **Notifications & reminders** | Push + email: market open, bet settled, promos | **None** — no notifications of any kind |
| **Social & engagement** | Public leaderboards, share, consensus %, contests | **Partial** — everyone's bets reveal at close (built-in transparency); no consensus, feed, or share |
| **Trust & transparency** | Bet receipts, transaction history, clear rules surfaced | **Partial** — odds snapshotted at placement; personalized rules card; no receipt / confirmation artifact |
| **Delight & gamification** | Streaks, badges, celebration animations | **Planned** — Jake celebration + motion vocabulary (Sprint 12); nothing shipped |
| **Home / dashboard** | Personalized, countdowns, quick actions, next-best-action | **Have** — pool total, budget module, compliance banners; no countdown or next-action prompt |

The honest read: Ozark is **strong on the parts unique to a pari-mutuel friend pool**
(transparency reveal, exact-entry budgeting, cent-accurate payouts) and **thin on the
connective experience tissue** DK/FanDuel obsess over (onboarding, review-before-commit,
reminders, moments of delight). That gap is exactly where the value is — and none of it
requires a new bet type.

---

## 2. Tier 1 — High-fit, high-value (do these)

### 1.1 Profile / account page
- **DK/FanDuel:** every user has a self-serve account — display name, preferences, verification, history.
- **Ozark:** today `display_name` and registration are Studio-only; a participant can't see or set their own identity in-app. A small `/account` page: set your own display name, see your entry fee, registration/ready-to-bet status, and a "how the pool works" link.
- **Impact:** Med · **Effort:** S–M · **Scope-fit:** ⚠️ — directly resolves the **display-names** open item (`OUTSTANDING_DECISIONS.md` §1: user-set-then-immutable vs. admin-set-in-Studio). Note the constraint: whatever a user sets **must still match the sheet's pick labels** for import name-matching (ADR 0001 §11), so an admin override stays necessary. Build after that call is made.
- **Slot:** new Sprint 15 (stub in §5).

### 1.2 First-run onboarding / "How this pool works"
- **DK/FanDuel:** a guided first-bet flow that teaches the mechanics before you risk anything.
- **Ozark:** the rules are genuinely non-obvious (phases, 5–10 picks *per phase*, total must equal entry exactly, bets go public at close). A dismissible first-login walkthrough — 3–4 cards — plus a persistent "How it works" entry point removes the "wait, how does this work?" texts to Pat.
- **Impact:** High · **Effort:** S · **Scope-fit:** ✅ — pairs naturally with the Sprint 14 announcement banner (shared dismiss-in-`sessionStorage` pattern).
- **Slot:** new Sprint 16 stub (§5), or fold the explainer content into Sprint 14.

### 1.3 Bet-slip / review-before-commit
- **DK/FanDuel:** add picks to a slip, *then* review the whole thing and confirm.
- **Ozark:** placement is inline and immediate — easy to lose track of whether you've hit exactly your entry across 5–10 picks and two phases. A lightweight review step — "here are your N picks totaling $X of your $Y entry; you're balanced / $Z short — confirm" — reinforces the exact-total rule (`lib/validation.ts`) at the moment it matters. **Not** a real bet slip with new wager types; a review/confirm surface over the placements already in `lib/validation.ts` and `/api/placements`.
- **Impact:** High · **Effort:** M · **Scope-fit:** ✅ — reuses existing validation; no rule change.
- **Slot:** new Sprint 17 stub (§5).

### 1.4 Phase-close countdown + email reminders
- **DK/FanDuel:** push + email for "market closing," "you have an unplaced entry."
- **Ozark:** there is a real, hard deadline — total must equal entry by **Phase 2 close**, and Phase 2 opens Friday night. That's the single most-missable thing in the pool. A visible countdown on the dashboard/`/bets`, plus opt-out email nudges ("Phase 2 is open," "you're $X short / not balanced — closes Saturday AM"), directly serves the "admins chase stragglers" reality (PRD §8.1) — automated.
- **Impact:** High · **Effort:** M · **Scope-fit:** ✅ — **this is the sanctioned form of the notifications idea** (Andrew greenlit push/email reminders; email via **Resend**, already a deferred hardening item in Sprint 0). Windows are admin-controlled, not time-based, so the countdown reads a target set on the `tournaments` row, and reminders fire off status flips — no time-based auto-close.
- **Slot:** new Sprint 18 stub (§5). Depends on Resend setup (Sprint 0 deferred item).

### 1.5 Bet receipt / confirmation
- **DK/FanDuel:** every placed bet produces a receipt with locked odds — a trust artifact.
- **Ozark:** odds *are* snapshotted into `odds_at_placement`, but the user never sees a confirmation of it. Surface a per-placement confirmation ("You're on **Jake Kohne to win R1** at +450, $5 — odds locked") on place/edit. Cheap trust win that also makes the odds-snapshot behavior visible and defends against "but the odds changed!" disputes.
- **Impact:** Med · **Effort:** S · **Scope-fit:** ✅ — surfaces existing data.
- **Slot:** fold into §1.3's review/confirm sprint (they're the same surface).

---

## 3. Tier 2 — Strong, conditional / medium effort

### 2.1 Menu discovery (search / filter / jump)
- **DK:** heavy search, filters, "jump to sport." **Ozark:** 13 bets / 57 picks today — light, but grows with props. Add filter-by-round/category, a "my open picks" filter, and phase jump-links on `/bets`.
- **Impact:** Med · **Effort:** S–M · **Scope-fit:** ✅. Low priority until the menu is bigger.

### 2.2 Consensus / "popular picks" — **after close only**
- **DK:** "% of bets on each side." **Ozark:** the same data becomes *social color* once a bet closes — "18 of 32 took the Field." **Critically: pre-close this must stay hidden** (it would leak positions and bias the pool, violating the hidden-until-close model). Show it only on closed bets, alongside the existing reveal.
- **Impact:** Med · **Effort:** S · **Scope-fit:** ✅ — respects the reveal boundary. Feeds the closed-bet views (Sprint 6).

### 2.3 Leaderboard enrichment
- **DK/FanDuel:** rich standings with projections. **Ozark:** Sprint 8 mirrors the workbook read-only; enrich it with **projected pari-mutuel standings** ("who's winning the pool right now" from `lib/payouts.ts` theoretical numbers), not just golf scores. Design ref (`Leaderboard` screen) already exists in the design kit.
- **Impact:** High · **Effort:** M · **Scope-fit:** ✅ — **augments Sprint 8**, doesn't replace it. ⚠️ Note the whole leaderboard is itself an open call (`OUTSTANDING_DECISIONS.md` §1: Pat floated dropping it); confirm it's staying before investing here.

### 2.4 Activity feed
- **DK:** social feeds of friends' activity. **Ozark:** "3 people have placed Phase 2 bets" builds pre-close momentum **without** leaking positions (counts/anonymized before close, full detail after). A dashboard strip, not a full feed.
- **Impact:** Med · **Effort:** M · **Scope-fit:** ✅ — must honor hidden-until-close (aggregate only pre-close).

### 2.5 Live-update polish
- **DK:** live everything. **Ozark:** Andrew flagged live updates as fair game — but the "real-time tote board" is permanently out (§4). The middle ground: light polling / refresh-on-focus so pool total, placement counts, and results don't show stale on a phone left open. Refresh-on-focus + a manual refresh affordance, not websockets.
- **Impact:** Low–Med · **Effort:** S · **Scope-fit:** ✅ — stops well short of real-time odds. PRD §3's "no real-time page updates" is about a live tote board that moves odds with pool weight; a stale-data refresh is a different thing — worth a one-line confirm with Pat before building.

---

## 4. Tier 3 — Delight & gamification (feeds Sprint 12)

DK/FanDuel lean on streaks, badges, and celebration moments. For a friend pool the
delight *is* the product — this is where personality lives.

- **Superlatives / badges:** end-of-tournament awards computed from placements — "Biggest Single Bet," "Most Contrarian" (took the least-popular winning pick), "All-In On Himself" (max self-bet), "Chalk Eater," "Coldest Streak." Cheap, hilarious, cent-data already exists.
- **Streaks across evergreen accounts:** accounts already persist across years — surface "3rd Ozark Open" tenure, prior finishes. **Career P/L is explicitly v2** (`ROADMAP.md`), so keep this to fun tenure/streak flavor, not a running ledger.
- **Share cards:** a generated results card ("I finished 2nd and turned $40 into $61 at the 2026 Ozark Open") for the group chat. Static image, on-brand.
- **Impact:** Med (High on vibe) · **Effort:** S–M each · **Scope-fit:** ✅ — **all augment Sprint 12** (animation & delight); no new sprint needed. Slot the superlatives/share card as extra Sprint 12 checkboxes.

---

## 5. Deliberately NOT recommended (⛔ — guardrails, not suggestions)

Listed so this doc can't be misread as inviting them. These stay out; the
experience-layer alternative is noted instead.

| Permanently out (PRD §3) | Why it stays out | Do this instead |
|---|---|---|
| **Parlays / same-game parlays** | New bet structure; multiplies adjudication the app deliberately doesn't do | Nothing — five categories are settled (ADR 0001) |
| **Live / in-play betting** | Requires live markets + real-time engine | Live-update *polish* (§2.5) — stale-data refresh only |
| **Cash-out** | Requires a live pricing engine over an open position | Nothing — pari-mutuel settles once, at the end |
| **Odds that move with pool weight (tote board)** | This is pari-mutuel *at settlement*, not a live market | Post-close consensus (§2.2) — the same info, without the live-market machinery |
| **In-app payments / real-money handling** | Payments are out of band (Venmo/cash), by decision | Nothing — the app tracks no payment status (PRD §10) |
| **Bet resolution / auto-grading** | Results come from Pat's workbook per pick (ADR 0001) | Nothing — the app never adjudicates |

---

## 6. Suggested Sprint 15+ stubs

Copy-paste-ready starting points matching the `docs/sprints/sprint-N.md` shape. These
are stubs, not full specs — flesh out the "Reads" and edge cases when you pick one up.
Numbers are suggestions; renumber to whatever's next.

### Sprint 15 — Self-Serve Profile / Account Page (Bonus)

> Bonus wish-list sprint. Enhancement, never an MVP blocker.

**Goal:** a `/account` page where a participant sets their own display name and sees their entry fee, registration status, and how the pool works — replacing Studio-only identity management.
**Target:** as time allows before Aug 28 · **Blockers:** **the display-name decision** (`OUTSTANDING_DECISIONS.md` §1) must be made first — user-set-then-immutable vs. admin-set. Also needs Sprint 4 (placements) shipped.
**Reads:** `OUTSTANDING_DECISIONS.md` §1 (display names), `ARCHITECTURE.md` (auth flow), ADR 0001 §11 (import name-matching).
- [ ] Confirm the display-name policy with Pat/Jake; record it in `PRD.md` §12.
- [ ] `/account` (auth-gated): show display name, entry fee, registration/ready-to-bet status.
- [ ] Editable display name **only if** policy allows; enforce that admin override in Studio still works (name-matching for import depends on it).
- [ ] "How this pool works" link/section (shares content with Sprint 16 if built).

**Done when:** a participant reads their own status and (per policy) sets their display name without an admin touching Studio.

### Sprint 16 — First-Run Onboarding & "How It Works" (Bonus)

**Goal:** a dismissible first-login walkthrough of phases, the 5–10-picks-per-phase / exact-entry-total rule, and the reveal-at-close mechanic, plus a persistent entry point.
**Target:** before betting opens (most useful early) · **Blockers:** none hard.
**Reads:** `PRD.md` §7 (bet rules), Sprint 14 (announcement banner — shared dismiss pattern).
- [ ] 3–4 card walkthrough shown on first authenticated visit; dismissible.
- [ ] Persist dismissal (reuse Sprint 14's `sessionStorage`-keyed pattern).
- [ ] Persistent "How it works" link in nav or dashboard.
- [ ] Content reviewed against `PRD.md` §7 so the rules stated are exactly the enforced ones.

**Done when:** a first-time user reads the walkthrough, dismisses it, and can re-open the explainer anytime.

### Sprint 17 — Bet-Slip Review & Confirmation (Bonus)

**Goal:** a review-before-commit surface over existing placements — "your N picks total $X of your $Y entry; balanced / $Z short — confirm" — plus a per-placement receipt with locked odds.
**Target:** before the group dry run (Sprint 9) if possible · **Blockers:** none hard; builds on Sprint 4 (placement API) and `lib/validation.ts`.
**Reads:** `PRD.md` §7/§8.1 (rules + enforcement timing), `lib/validation.ts`, `/api/placements`.
- [ ] Review panel summarizing all picks for a phase: count, per-pick amount, running total vs. entry, balanced/short state (reuse `lib/validation.ts` — no new rules).
- [ ] Confirmation on place/edit showing the snapshotted `odds_at_placement` ("odds locked at …").
- [ ] Clear "you still owe $Z / you're over" messaging tied to the exact-total rule.

**Done when:** a participant reviews their full phase, sees they're balanced (or not), confirms, and gets a receipt showing locked odds.

### Sprint 18 — Phase Countdown & Email Reminders (Bonus)

**Goal:** a visible phase-close countdown and opt-out email nudges so nobody misses the Phase 2 deadline — the sanctioned notifications feature.
**Target:** before betting opens · **Blockers:** **Resend/SMTP setup** (Sprint 0 deferred hardening) must land first.
**Reads:** `PRD.md` §8 (lifecycle/phases), Sprint 0 (Resend deferred item), `tournaments` row params.
- [ ] Countdown on dashboard/`/bets` driven by a target on the `tournaments` row (windows stay admin-controlled — display only, never auto-closes a phase).
- [ ] Opt-out email on Phase 2 open ("betting's open").
- [ ] Opt-out email to anyone under-minimum or not balanced ahead of Phase 2 close.
- [ ] Per-user email preference (default on); no other notification types.

**Done when:** Phase 2 opening and an unbalanced entry each trigger the right email, and the countdown reflects the admin-set target.

---

## 7. Cross-references — what unblocks the ⚠️ ideas

| Idea | Depends on | Owner |
|---|---|---|
| Profile / account page (§1.1, Sprint 15) | Display-name policy — `OUTSTANDING_DECISIONS.md` §1 | Pat + Jake (with Andrew) |
| Leaderboard enrichment (§2.3) | Whether the participant leaderboard survives at all — `OUTSTANDING_DECISIONS.md` §1 | Pat + Jake |
| Live-update polish (§2.5) | One-line confirm that stale-data refresh ≠ the banned real-time tote board — `PRD.md` §3 | Pat |

Everything in Tier 1 outside §1.1, all of Tier 3, and §2.1/§2.2/§2.4 are ✅ — no
stakeholder call required; build when they fit before the Aug 28 freeze.
