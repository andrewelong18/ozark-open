# Ozark Open Sportsbook — Dry Run Gameplan

**One evening. Andrew + Pat. The whole tournament weekend, compressed.**

By the end of the session you will have run every step of September 24–26 — opening the menu,
taking wagers, closing a phase, publishing results, opening Phase 2, and paying out a
pari-mutuel pool — against the real production app, with a simulated fifteen-person pool.

The bar, borrowed from Sprint 9: **the dry run completes without an admin needing to touch code
or ask Andrew a question.** Anywhere Pat gets stuck, that's the finding. Write it down and keep
moving.

---

## How to use this document

Work top to bottom. Tick boxes as you go — `- [x]`. Two roles:

| Role | Who | Does |
|---|---|---|
| **Driver** | Pat | Clicks. Uploads the spreadsheets. Runs the admin console. Anything a non-developer admin would do in September. |
| **Navigator** | Andrew | Reads the steps aloud, runs the SQL, watches for the "expect exactly" lines, and types into the issue log. |

**Pat drives everything he'd drive in September.** If Andrew takes the mouse to get past
something, that's a finding — log it. The whole point is to discover which parts of this only
work because Andrew knows a trick.

Every test carries a tier so you can cut intelligently when time runs short:

| Tier | Meaning |
|---|---|
| **P0** | If this doesn't work, September doesn't happen. Never skip. |
| **P1** | Should work before Sept 10. Skip only if you're out of time. |
| **P2** | Polish and edge cases. Skip freely. |

---

## Timing budget

Total **≈3h05m** including setup. If you're running long, the cut order is: Act 11 → Act 12's
back half → the P2 items in Act 4 → Act 2's edge cases.

| | Act | Tier | Time |
|---|---|---|---|
| **Part 0** | Setup (Andrew, solo, before Pat arrives) | — | 45 min |
| 1 | Cold open — what a new member sees | P0 | 20 min |
| 2 | Pat runs the access console | P0 | 20 min |
| 3 | Phase 1 goes live — the import | P0 | 20 min |
| 4 | **The rules gauntlet** | P0 | 45 min |
| 5 | The reprice — odds snapshot integrity | P0 | 15 min |
| 6 | Closing Phase 1 — the chase and the reveal | P0 | 20 min |
| 7 | Thursday night — Round 1 results | P0 | 20 min |
| 8 | Friday night — Phase 2 opens | P0 | 15 min |
| 9 | Saturday morning — Phase 2 closes | P1 | 10 min |
| 10 | **Saturday night — payouts and reconciliation** | P0 | 25 min |
| 11 | Leaderboard and the mobile pass | P1 | 15 min |
| 12 | Debrief and the open decisions | P0 | 20 min |
| **Part 2** | Teardown (Andrew, solo, after) | — | 15 min |

---

## Logging issues

Two tiers, both in `docs/dry-run/ISSUE_LOG.md`. Open it in a second window now.

**Fast capture** — say it out loud, Navigator types one line, nobody stops:

```
[4.7][P0] expected the self-cap error at $6, it accepted the wager
```

**Fill in the table** at the next natural pause, while it's fresh. When the session is over,
paste the completed table into Claude Code with *"file these as GitHub issues"* and each row
becomes a self-contained issue titled `Sprint 9: …`.

**Never** fix code mid-session. A fix invalidates everything tested before it and eats the
evening. Log and continue.

---

## Known landmines

Read these before you start — each one looks like a bug and isn't.

1. **Admin pages return 404, not 403.** A non-admin hitting `/admin/people` gets "page not
   found". That's deliberate — a 403 would confirm the page exists.
2. **`tournaments.status` does not gate betting.** It lights the "Betting Open" badge and
   unlocks `/results`. What actually opens and closes wagering is each **bet's own** status,
   which only ever changes via a spreadsheet upload.
3. **Placing a wager takes two taps.** Type an amount, then confirm on the strip that appears.
   One click writes nothing.
4. **`/leaderboard` shows an empty state, not an error, when Google Sheets isn't configured.**
   Sprint 8's service account is still outstanding, so an empty leaderboard is the expected
   result tomorrow, not a bug.
5. **`/results` is invisible until someone flips `tournaments.status = 'completed'` in SQL.**
   There is no button for it. That's Act 10 and it's a real finding.
6. **The import report will list ~12 unmatched pick names.** "Field", "Yes"/"No", "Even"/"Odd"
   and golfers with no account never link to a person. That's correct behaviour (Q10).
7. **A re-upload of an identical sheet is the normal workflow**, not a recovery step. It must
   report zero changes.

---

# Part 0 — Before Pat arrives

**Andrew, solo, ~45 minutes.** Do not skip the rehearsal step; it's the difference between
finding a problem now and finding it in front of Pat.

### 0.1 Rehearse the whole thing locally · P0

```bash
npm install
npm run test          # 186 unit tests
npm run lint
npm run build
bash scripts/dry-run-verify.sh
```

`dry-run-verify.sh` spins up a throwaway Postgres, applies every migration, then walks the
entire evening — reset → sim pool → four uploads → both placement seeds → the reprice → final
payouts → teardown — and asserts 50+ facts along the way. It ends by printing the payout table
this session should land on (reproduced in [Appendix A](#appendix-a--the-expected-payout-table)).

- [x] All 186 unit tests pass
- [x] `dry-run-verify.sh` ends with "The whole dry-run script passes end to end."

> **macOS:** the script's defaults are Linux-shaped. On this Mac it needs three
> env vars, or `pg_ctl` fails with an unhelpful "could not start server":
> ```bash
> LC_ALL=C TMPDIR=/tmp PGBIN=/opt/homebrew/opt/postgresql@16/bin bash scripts/dry-run-verify.sh
> ```
> `PGBIN` because the default globs `/usr/lib/postgresql/*/bin`; `LC_ALL=C`
> because the postmaster otherwise "became multithreaded during startup";
> `TMPDIR=/tmp` because the default temp path exceeds the 103-byte socket limit.

> **Known:** `npx tsc --noEmit` currently fails on `lib/profile.test.ts:61`. It is pre-existing
> on `main`, unrelated to the dry run, and does not affect the app — but it means CI is red.
> File it, don't fix it tonight.

### 0.2 Snapshot production · P0

The free Supabase tier has no automated backups, and Part 0 is about to delete every placement.
The data is small, so a JSON dump is plenty.

- [x] In the Supabase SQL editor, run each of these and save the output to a file:
  ```sql
  SELECT json_agg(t) FROM (SELECT * FROM public.users) t;
  SELECT json_agg(t) FROM (SELECT * FROM public.tournament_participants) t;
  SELECT json_agg(t) FROM (SELECT * FROM public.bet_placements) t;
  SELECT json_agg(t) FROM (SELECT * FROM public.bets) t;
  SELECT json_agg(t) FROM (SELECT * FROM public.bet_picks) t;
  ```
- [x] Saved to somewhere that isn't this laptop — Google Drive, 2026-07-31

### 0.3 Reset production and seed the pool · P0

Run in order, in the Supabase SQL editor (or via the Supabase MCP from Claude Code):

- [x] `supabase/dry-run/00-reset.sql` — clears placements, hides the menu, sets every result
      back to `pending`, flips the tournament to `active`
- [x] `supabase/dry-run/10-accounts.sql` — creates the twelve simulated accounts
- [x] Both verification queries at the bottom of those files return what their comments say

**Why the reset is needed:** production currently holds the sample menu with every Phase 1
result already filled in, plus a dozen stale test wagers. Starting there would mean opening a
menu whose outcomes are already decided.

### 0.4 The simulated pool · P0

Twelve accounts on `@dryrun.ozark.test`. **The names are the trick** — self-pick flagging, the
self-bet cap, and the opponent hard-block only fire when a pick is linked to a person, and that
link is made at import time by matching the pick label against `users.display_name`. Production
today has exactly one matched name, which is why most of the money rules have never actually
run. These accounts are named after golfers already in the menu, so the Act 3 upload wires up
56 picks.

**Hand-driven** — these three get browser windows and place wagers through the real UI:

| Display name | Email | Entry | Why this one |
|---|---|---|---|
| **Dan Mercer** | `dan.mercer@` | $40 | Tournament favourite. Max single **$20**, self cap **$10**. He's one side of *Match - Round 1*, so he's the opponent-block test. |
| **Jake Kohne** | `jake.kohne@` | $25 | The **floor** case: 50% of $25 is $12.50, and the code floors to **$12**, never $13. Appears as "Jake Kohne (E)" in a Group Match, so he tests stroke-suffix stripping. |
| **Casey Sideline** | `casey.sideline@` | $50 | **Non-player.** The **cap** case: 50% of $50 is $25 but the hard cap binds at **$20**. Exempt from the self-bet rule — and subject to no stricter limit at all, which is the open decision he exists to raise. |

**Funnel demo** — these two never place a wager; they exist to show the access states:

| Email | State |
|---|---|
| `newbie@` | Un-onboarded. Act 1 walks it through onboarding as **"Mike Yenzer"**. |
| `pending@` | Onboarded, not approved. The browse-only state. |

**Bulk-seeded** — seven bettors whose wagers arrive by SQL, so the pool has enough mass for the
payout split to be a real test: Garrett Klenke ($20), Ethan Kipping ($30), Alex Leslie ($40),
**Devin Arand ($20 — the deliberate straggler)**, Dustin Scheller ($35), Mike Vemmer ($50),
Rob Vemmer ($25).

Plus the three real accounts: Andrew ($20, bulk-seeded), **Pat ($20, raised to $30 in Act 2)**,
and **Steve Esswein ($20, never places a wager)** — the deliberate "paid the entry, never bet"
control.

**The derived limits**, which you'll quote at Pat repeatedly:

| Entry | Max single bet | Max on yourself |
|---|---|---|
| $20 | $10 | $5 |
| $25 | **$12** (floors from 12.5) | $6 |
| $30 | $15 | $7 |
| $35 | **$17** (floors from 17.5) | $8 |
| $40 | $20 | $10 |
| $50 | **$20** (the cap, not the 50%) | $10 |

### 0.5 Mint the logins · P0

Hosted Supabase's built-in SMTP sends only a few auth emails an hour, which will not survive a
session with this many accounts. `scripts/dev-magiclink.ts` mints a login link with the
service-role key and **sends no email at all**.

- [ ] Grab the service-role key from Supabase → Project Settings → API
- [ ] For each of `dan.mercer@`, `jake.kohne@`, `casey.sideline@`, `newbie@`, `pending@`:
  ```bash
  SUPABASE_URL=https://rbjqqzjqhsbcotqfrwhb.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
  SITE_URL=https://ozark-open.com \
  node --experimental-strip-types scripts/dev-magiclink.ts dan.mercer@dryrun.ozark.test
  ```
- [ ] Paste each link into its **own Chrome profile** (not incognito windows — those share a
      session within a window group). Label the profiles by name.

> **Fixed since Jul 31 (#94):** the script used to print Supabase's legacy `action_link`, which
> `/auth/callback` rightly rejected with *"Login link was missing its token."* It now emits
> `…/auth/callback?token_hash=…&type=magiclink`. If you see that error again, the link is stale
> or already used — mint a fresh one.
- [ ] Leave Pat's own account for Act 1 — his login is a real test of the real email path.

> **Session length — already done, no action needed.** Verified against prod auth config on
> 2026-07-31: `sessions_timebox = 0` and `sessions_inactivity_timeout = 0`. Issue #17 was
> closed 2026-07-20. Do **not** re-run `prod-auth-config.sh`; nobody will be logged out.
>
> **Magic links expire after 1 hour** (`mailer_otp_exp = 3600`) and are single-use. Mint them
> when Pat is nearly at the door, not hours ahead, or you'll be re-minting five links.

### 0.6 Stage everything · P0

- [ ] Prod loads: <https://ozark-open.com>
- [ ] The four lifecycle spreadsheets are on the desktop, in order. **Pat's own workbook if he
      brought it**, otherwise the fallbacks in `docs/dry-run/sheets/`:
      `1-phase1-open` · `1b-phase1-repriced` · `2-phase1-closed-r1-results` ·
      `3-phase2-open` · `4-phase2-closed-final` · `X-broken` · `X-results-on-open`
- [ ] `docs/dry-run/ISSUE_LOG.md` open in a second window
- [ ] The Supabase SQL editor open in a tab
- [ ] `docs/admin/phase-compliance.sql` pasted into a scratch SQL tab, ready to run

---

# Part 1 — The session

## Act 1 · Cold open — what a new member sees · 20 min · P0

**Why this matters.** Thirty-two people will hit this app for the first time on the same
evening, most on a phone, none having read anything. Every minute of confusion here is a text
message to Pat. This is the single highest-support-load moment of the whole tournament, and
it's the part that has never been tested by someone who didn't build it.

**Behind the scenes.** There's no email allowlist — anyone can request a magic link and get an
account. What's gated is *betting*: the middleware forces any account without an `onboarded_at`
stamp to `/onboarding`, and `/api/placements` refuses anyone without a row in
`tournament_participants`. That row is created by an admin in Act 2, and its mere existence is
the permission.

### 1.1 The logged-out front door · P0
- [ ] In a private window, open <https://ozark-open.com>
- [ ] **Pat reads the landing page cold.** Does he know what this is and what to do next?
- [ ] Try `/dashboard` directly while logged out → bounces to `/login`

### 1.2 Pat logs in for real · P0
This is the only email round-trip of the evening, and it's the one that has to work in
September.

- [ ] Pat enters `pleicht17@gmail.com` on `/login`
- [ ] **Start a timer.** How long until the email lands? Check spam.
- [ ] Click the link → lands on `/dashboard`, signed in as Pat

**Log it if:** the email takes more than a minute, lands in spam, or the sender name looks
untrustworthy.

> **Resend is already live** — verified against prod auth config on 2026-07-31:
> `external_email_enabled = true`, `smtp_host = smtp.resend.com`, `rate_limit_email_sent = 30/hr`.
> Issue #16 was closed 2026-07-20. So this step is no longer "will the built-in dev mailer
> cope?" — it's an acceptance test of Resend's deliverability and sender reputation. Judge it
> on **speed, inbox-vs-spam, and what the From line says**.

### 1.3 A brand-new member onboards · P0
- [ ] Switch to the **newbie** Chrome profile
- [ ] Try to navigate anywhere — `/bets`, `/dashboard`. You should be pushed to `/onboarding`
      every time
- [ ] **Pat fills in the onboarding form himself**, setting the display name to exactly
      **`Mike Yenzer`**
- [ ] Optionally set a nickname and upload an avatar
- [ ] Submit → lands on `/dashboard`

> **Why that name specifically.** Two picks in the menu are labelled "Mike Yenzer (-10)" and
> "Mike Yenzer (E)". When Pat uploads the sheet in Act 3, those two picks will link themselves
> to this account. It's the clearest possible demonstration of how the app knows who's who —
> and it's worth pointing out to Pat as it happens.

- [ ] Go back to `/onboarding` → redirects to `/dashboard`; the name is now locked

**Behind the scenes:** a database trigger allows a member to set their own display name exactly
once. After that it's admin-only. The nickname stays editable forever.

### 1.4 The approval-pending state · P0
- [ ] Still as Mike Yenzer, visit `/bets` → *"No bets published yet — the book opens when an
      admin publishes the menu."* The menu is empty for **everyone** until Act 3.1, because
      `00-reset.sql` hides all 19 bets
- [ ] `/my-bets` and `/dashboard` show "approval pending" empty states
- [ ] Visit `/admin/people` → **404 page not found** (this is correct, not a bug)
- [ ] Visit `/admin/import` → **404**

> **Deferred to 3.1:** "the menu is visible with no stake inputs" can't be checked here — there
> is no menu yet. Act 3.1 checks it once the upload lands.

**Log it if:** the notice doesn't make it obvious what to do next ("text Pat"), or a stake input
appears anywhere.

### 1.5 Someone stalled in the funnel · P2
- [ ] Switch to the **pending** profile → same browse-only experience, but already onboarded

---

## Act 2 · Pat runs the access console · 20 min · P0

**Why this matters.** In September Pat approves roughly thirty people, sets each of their entry
fees, and fields "why can't I bet yet" questions — all without Andrew. `/admin/people` is the
only tool he has. If it doesn't hold up, the fix has to happen before Sept 10.

**Behind the scenes.** The page derives a four-stage funnel by joining three tables:
`tournament_invites` (an email list, no accounts), `users` (signed up), and
`tournament_participants` (approved). No account → not onboarded → awaiting approval →
approved. Invites never touch pool math; they exist so Pat can see who hasn't shown up yet.

- [ ] As Pat, go to `/profile` → **Admin** tab → **People**

### 2.1 The invite list · P1
- [ ] Paste a list of names and emails into the invite box — mix formats deliberately:
      `Name <email>`, bare emails, one per line, a duplicate, a blank line
- [ ] Submit → the report shows added / updated / unchanged / skipped
- [ ] The "No account" stat card goes up by the number of new emails
- [ ] Paste the **same list again** → everything reports as unchanged, nothing duplicates

### 2.2 Approving Mike Yenzer · P0
- [ ] Find Mike Yenzer under "Awaiting approval"
- [ ] Approve with entry fee **$20**, player = yes
- [ ] The stat cards move: awaiting approval down one, approved up one

> **Deferred to 3.1:** "stake inputs have appeared" needs a menu to appear in. Check it there.

**This is the moment to point out to Pat:** nothing else changed. One row in one table is the
entire difference between browsing and betting.

### 2.3 Entry fee bounds · P0
Try each of these on **Casey Sideline** and note exactly what happens:

- [ ] **$15** → rejected: *"Entry fee must be between $20 and $50."*
- [ ] **$60** → rejected, same message
- [ ] **$22.50** → rejected: *"Entry fee must be a whole-dollar amount."*
- [ ] **$35** → accepted
- [ ] **Put it back to $50.** Not optional: at $35 his max single bet floors to $17, so Act 4.6's
      cap case (*"Max single bet is $20 for your $50 entry"*) can't fire, and Appendix A's
      reconciliation is $15 light. This step was missing on Jul 31 and silently broke both.

> **Worth knowing:** the database itself only enforces `entry_fee > 0`. The $20–$50 bounds live
> on the tournament row and are enforced in application code only — the original schema
> constraint was dropped in the July rework. So this test is the *only* thing standing between
> Pat and a $500 entry fee. If any of the above is accepted, that's a **P0**.

### 2.4 Pat sets his own entry fee · P0
- [ ] Edit **Pat Leicht** from $20 to **$30**
- [ ] Confirm it sticks after a reload

### 2.5 Revoke and re-grant · P1
- [ ] Revoke Mike Yenzer's access → his window reloads to the browse-only state, and his row
      reads **Revoked** (not "No account")
- [ ] `/dashboard`'s pool total drops by exactly his $20 while he's revoked
- [ ] Re-approve → the form **pre-fills $20**, his preserved fee. Betting is back and the pool
      total returns to where it was

**Log it if:** the re-approve form has forgotten his fee, or the pool total doesn't come back to
the cent. (Revoke stamps `revoked_at`; nothing is deleted — Sprint 21 / #91. On Jul 31 this was
a hard DELETE, so his $20 went to $0 and the pool silently shrank while his wagers stayed in it.)

### 2.6 The chase view · P1
- [ ] Read the two "chase" blocks at the top. Do they tell Pat who to text, in plain language?

---

## Act 3 · Phase 1 goes live — the import · 20 min · P0

**Why this matters.** The spreadsheet is the entire content management system. Every bet, every
price, every result, every open and close for the whole weekend arrives this way. Pat will do
this four times over three days, twice from a phone or a laptop on a golf course. It has to be
boring.

**Behind the scenes.** The upload is validated completely **before anything is written** — one
bad cell rejects the whole file. Valid files are then *upserted* by the sheet's own `bet_id` and
`pick_id`, which is why re-uploading is safe and normal. Uploads never touch anyone's wagers.

### 3.1 The menu goes live · P0
- [ ] As Pat: `/profile` → **Admin** → **Import**
- [ ] Upload `1-phase1-open.xlsx` (or Pat's own Phase 1 sheet)
- [ ] **Read the import report aloud.** With the fallback sheet expect
      *0 bets created / 13 updated · 0 picks created / ~50 updated · ~13 unmatched pick names*.

      **Updated, not created** — production already holds this menu from July, so the upload is
      flipping 13 bets from hidden to open rather than building the book from scratch. Pat's own
      sheet will show different counts; what matters is that the numbers are *explicable*. If
      Pat can't tell from the report whether the upload did what he wanted, log it.
- [ ] Go to `/bets`. Expect **13 Phase 1 bets, open**, grouped by round then category.
      Phase 2 is nowhere to be seen — it's hidden.
- [ ] No pick shows a result badge. Nothing has been played yet.
- [ ] Spot-check one bet against the spreadsheet: title, every pick label, the American odds,
      the fractional odds, the probability to one decimal, and the total probability banner.
      **These are displayed verbatim from the sheet — the app never recalculates them.**

**The two checks deferred from Acts 1.4 and 2.2** — they need a published menu, which only
exists from here on (moved Jul 31, #109):

- [ ] Switch to the **pending** window (still unapproved): `/bets` shows the whole menu with
      **no stake inputs**, and a notice explaining approval is pending
- [ ] Switch to the **Mike Yenzer** window (approved in Act 2.2), reload `/bets` →
      **stake inputs are there**. Same menu, same page — one participant row is the whole
      difference between browsing and betting

### 3.2 The unmatched names · P1
- [ ] Look at the unmatched-name chips. "Field", "Yes", "No", "Even", "Odd" and any golfer
      without an account should be there — that's correct.
- [ ] **Mike Yenzer should NOT be in that list.** He onboarded in Act 1, so his two picks just
      linked themselves. Show Pat.

### 3.3 Idempotency — the safety net · P0
- [ ] Upload the **exact same file** again
- [ ] Expect: *"No changes — the menu already matches this sheet."* Zero created, zero updated.

**Why this matters so much:** on tournament morning, if an upload seems to hang or Pat isn't
sure it worked, the correct move is always "upload it again." That only works if identical
uploads are true no-ops.

### 3.4 The broken file — atomicity · P0
- [ ] Upload `X-broken.xlsx`
- [ ] Expect a **rejection with per-row errors**, roughly:
      - `Row 2: status must be open, closed, or hidden (got "frozen")`
      - `Row 3: american_odds must be a nonzero integer (got "0")`
      - `Duplicate pick_id 13 (rows 14, 89) — pick_id must be unique across the sheet`
- [ ] Message confirms nothing was imported
- [ ] Reload `/bets` → **the menu is completely unchanged**

**Log it as P0 if even one row from that file landed.** "A typo can't half-apply your menu" is
the guarantee the whole spreadsheet workflow rests on.

### 3.4b Results on a live book — the July mistake · P0
This is the file shape that actually got through on Jul 31: Round 1 verdicts pasted in while the
Phase 1 bets still read `open`. The app took it silently and published hit/miss onto bets that
were still showing stake inputs. Sprint 22 (#97) made it a hard block.
- [ ] Upload `X-results-on-open.xlsx`
- [ ] Expect a **rejection with one error per verdict-bearing row**, roughly:
      - `Row 2: result "hit" on bet_id 1, which is still open — results may only be published
        on a closed bet. Close the bet in the sheet, or set the result back to Pending.`
- [ ] Reload `/bets` → **the menu is completely unchanged**, no results showing anywhere
- [ ] **Ask Pat:** is the message enough to tell him what to fix in his workbook?

### 3.5 Load the bulk wagers · P0
*(Navigator, in SQL — 30 seconds)*
- [ ] Run `supabase/dry-run/20-phase1-placements.sql`
- [ ] The verification query at the bottom shows 8 bettors, 42 wagers, Devin Arand at 3 picks
      and $8

---

## Act 4 · The rules gauntlet · 45 min · P0

**This is the most important act of the evening.** Every one of PRD §7's money rules gets fired
deliberately. These rules are the reason the app exists rather than a group text — they are
what stops someone from putting their whole entry on themselves.

**Behind the scenes.** Every rule is enforced **server-side** in `lib/validation.ts`, called
from the API route. The browser's checks are convenience only. Two groups matter:

- **Hard-blocked at submission** — the write is refused: bet must be open · whole dollars, $1
  minimum · at most the max single bet · at most 10 picks in a phase · self-bet total across
  the whole tournament within cap · running total never over the entry fee · one pick per
  Match/Group Match · never on your opponent.
- **Checked only at Phase 2 close, never blocking** — at least 5 picks **across both phases
  combined** · total exactly equal to the entry fee. You're *supposed* to be incomplete while
  betting is open, and a 3-and-2 split across the phases is complete.

Work in the **Dan Mercer** window unless a step says otherwise. Expected error text is quoted
exactly — a different wording isn't necessarily a bug, but note it if it's confusing.

### 4.1 Place a wager the happy way · P0
- [ ] `/bets` → *Win Tournament* → **Dan Mercer** → enter `6`
- [ ] A confirmation strip appears. **Nothing is written until you confirm.**
- [ ] Confirm → the wager sticks, showing the odds it locked in at
- [ ] The bet-slip bar at the bottom updates: wagered, remaining, pick count
- [ ] `/my-bets` shows it under Phase 1

> **Point out to Pat:** the price is stamped onto the wager at this moment and never changes
> again, even if the line moves. Act 5 proves it.

### 4.2 The self-pick flag · P0
Dan just bet on himself. That's allowed in every category — but flagged.

- [ ] Navigator: check `/admin/view` in Pat's window. Dan's wager carries a **review flag**.

### 4.3 Amounts · P0
- [ ] `0` → *"Minimum bet is $1."*
- [ ] `2.50` → *"Bet amounts must be whole dollars."*
- [ ] `-5` → rejected
- [ ] `1` → accepted

> **These next three are boundary tests, not slate-building.** After each accepted amount,
> **remove the wager** — otherwise these bettors blow their budgets before Act 8 and the numbers
> in 8.2 won't line up.

### 4.4 The max single bet · P0
Dan's entry is $40, so his max is $20 (50% and the cap coincide).
- [ ] `21` → *"Max single bet is $20 for your $40 entry."*
- [ ] `20` → accepted, then removed

### 4.5 The floor, not the round · P0 — *the subtle one*
Switch to the **Jake Kohne** window. His entry is $25. Half of that is $12.50, and the code
**floors** it.
- [ ] `13` → *"Max single bet is $12 for your $25 entry."*
- [ ] `12` → accepted, then removed

**Log it as P0 if $13 is accepted.** Rounding up here would let everyone overspend by a dollar,
which breaks the pool total.

### 4.6 The hard cap · P0
Switch to **Casey Sideline**. Entry $50 — half is $25, but the cap is $20.
- [ ] `21` → *"Max single bet is $20 for your $50 entry."*
- [ ] `20` → accepted, then removed

### 4.7 The self-bet cap · P0
Back to **Dan Mercer** ($40 → cap $10 on himself, across the *whole tournament*, both phases).
- [ ] Dan has $6 on himself already. Add **$4** on *Medalist - Round 1 → Dan Mercer* → accepted,
      now exactly at the cap
- [ ] Try **$1** on any other pick that is Dan → *"Max total on yourself is $10 for your $40
      entry — this would put you at $11."*
- [ ] Try betting on **"Field"** in Win Tournament → **accepted**. "The field" is nobody, so it
      is never a self-pick even though Dan is in the field (Q10).

### 4.8 The non-player exemption — *and an open decision* · P0
Switch to **Casey Sideline**, who is flagged as a non-player.
- [ ] Casey has no picks bearing his name, so the self-bet rule can't apply to him
- [ ] **Ask Pat now:** he asked back in July for non-playing bettors to have a *stricter*
      betting maximum, but never gave a number. **Today the code applies no stricter limit at
      all** — Casey gets the same $20 max as any $50 player.
- [ ] **Write Pat's answer in the issue log**, even if the answer is "leave it"

### 4.9 One pick per match · P0
- [ ] As **Casey** (not in any match), open a *Match - Round 1* bet and place on one side
- [ ] Try the other side → its stake box is **disabled**, and the bet's subline says
      *"Pick one · remove your $X on <pick> to switch picks"*. The rule is a control you
      can't use, not a message after you type (#162 — it was a radio until Aug 12, 2026).
      The server's *"This bet allows only one pick per participant."* is still the
      enforcement behind it, and is what a hand-made request would hit
- [ ] Remove the first wager → the other side becomes enterable again
- [ ] Same test on a **Group Match** (3+ players)
- [ ] Contrast: *Win Tournament* allows as many picks as you like

### 4.10 The opponent block · P0 — *the rule with teeth*
Switch to **Dan Mercer**, who is one side of *Match - Round 1* against Garrett Klenke.
- [ ] Try to place on **Garrett Klenke** in that match → *"You can't bet on your opponent in a
      match you're playing in."*
- [ ] Place on **Dan Mercer** in that same match → accepted

Now switch to **Jake Kohne**, who appears as **"Jake Kohne (E)"** in a Group Match:
- [ ] Try any other pick in that Group Match → the same rejection

**Why the second one matters:** it proves the app strips the stroke handicap off a label before
deciding who a pick refers to. Real match labels always carry strokes, so if suffix-stripping
broke, the opponent rule would silently stop working on every match in the book.

### 4.11 The running total · P0
- [ ] Get Dan close to his $40, then try to exceed it → *"Over your $40 entry — that's the most
      you can wager across both phases."*
- [ ] The bet-slip bar shows remaining budget correctly

### 4.12 Ten picks in a phase · P1
- [ ] Get any bettor to 10 Phase 1 picks, then try an 11th → *"Phase 1 is full — 10 picks max."*

### 4.13 Edit, remove, re-place · P0
- [ ] Change an existing wager's amount → updates in place, no second entry appears
- [ ] Remove a wager → it disappears from `/bets` and `/my-bets`
- [ ] Place on that **same pick** again
- [ ] Navigator, in SQL:
      ```sql
      SELECT count(*) FROM public.bet_placements WHERE user_id =
        (SELECT id FROM public.users WHERE email = 'dan.mercer@dryrun.ozark.test');
      ```
      The count must **not** have grown — removing soft-deletes, and re-placing revives the
      same row.

**Why:** every wager is money. Rows are never hard-deleted, so a dispute in September can always
be reconstructed. A duplicate row here would double-count someone in the pool.

### 4.14 Privacy while the phase is open · P0
- [ ] In the **Jake Kohne** window, look at a bet Dan has wagered on. **Jake must not see Dan's
      wager, or any total.**
- [ ] Same in `/bets` and `/my-bets`

**Log it as P0 if any other bettor's money is visible.** Amounts stay private until close
(Q11) — that's enforced by row-level security in the database, not just by the UI.

### 4.15 The incomplete banner · P1
- [ ] A bettor who's under their entry fee sees something like *"You've wagered $25 of $40 —
      Phase 2 must bring you to exactly $40."*
- [ ] Pat's read: is it clear this is a warning, not an error?

### 4.16 Settle everyone's Phase 1 slate · P0
The boundary tests above left these bettors with scattered wagers. Tidy each window so the
leftover budgets match what Act 8 expects — the exact picks don't matter, the totals do:

| Bettor | Phase 1 total | Picks | Leaves for Phase 2 |
|---|---|---|---|
| Dan Mercer | **$25** of $40 | ≥5 | $15 |
| Jake Kohne | **$15** of $25 | ≥5 | $10 |
| Casey Sideline | **$30** of $50 | ≥5 | $20 |
| Pat Leicht | **$18** of $30 | ≥5 | $12 |

- [ ] Pat places his own slate in his own window, including at least one wager on himself
- [ ] Each window's bet-slip bar reads the right remaining budget

### 4.17 The 5–10 span — *answered Jul 31, 2026* · reference only
Pat's ruling, now shipped (Sprint 22 / #96, PRD §12 A14): **the minimum of 5 spans the whole
tournament** and is only evaluated before Phase 2 closes; **the maximum of 10 stays per phase.**
"All of them in one round, none in the other" is legal, and so is a 3-and-2 split.
- [ ] Sanity-check it on screen: a bettor with 3 Phase 1 picks shows "3 of 5 … you have until
      Phase 2 closes", not a Phase 1 failure, and the phase header reads "3 of 10 picks".

### 4.18 Optional shortcut
If Act 4 has eaten its time box, run `supabase/dry-run/25-phase1-handdriven-fallback.sql` to
fill in the remaining hand-driven slates and move on. Note in the log which tests you skipped.

---

## Act 5 · The reprice — odds snapshot integrity · 15 min · P0

**Why this matters.** This is the most expensive thing in the app to get wrong and the hardest
to notice. Lines move: someone strings three birdies together on the range and Pat shortens
them. Everyone who already backed that player at the old price **must keep the old price**. If
that snapshot leaks, every payout after it is wrong, and nobody would spot it until money
changed hands.

**Behind the scenes.** Each wager stores `odds_at_placement` at the moment it's written. Payout
math reads only that stored number and never the live pick. A re-upload that changes a price
therefore affects future wagers only — and the import report warns when a repriced pick already
has money on it.

### 5.1 Move the line · P0
- [ ] Navigator, first record the truth:
      ```sql
      SELECT u.display_name, p.amount, p.odds_at_placement
        FROM public.bet_placements p
        JOIN public.bet_picks pk ON pk.id = p.pick_id
        JOIN public.users u ON u.id = p.user_id
       WHERE pk.sheet_pick_id = 1 AND p.deleted_at IS NULL;
      ```
      Everyone should show **110**.
- [ ] Pat uploads `1b-phase1-repriced.xlsx` — Dan Mercer to win moves from **+110 to −140**

### 5.2 The warning · P0
- [ ] The import report carries a warning naming the pick, roughly:
      *Odds changed on "Dan Mercer" (Win Tournament) while it has live placements: 11/10 → 7/12.
      Existing placements keep their snapshotted odds; only future placements get the new price.*

**Log it if there's no warning.** Pat needs to know when a reprice touched live money.

### 5.3 The proof · P0
- [ ] `/bets` now shows Dan Mercer at the new price (fractional odds and probability moved too)
- [ ] Re-run the SQL from 5.1 → **every existing wager still reads 110**
- [ ] In the Dan Mercer window, `/my-bets` still shows his original price

### 5.4 Two prices on one pick · P1
- [ ] Have **Casey Sideline** place a *new* wager on that same pick
- [ ] Re-run the SQL → two different `odds_at_placement` values on the same pick, both correct
- [ ] Both will pay out at their own price in Act 10

---

## Act 6 · Closing Phase 1 — the chase and the reveal · 20 min · P0

**Why this matters.** Thursday morning, minutes before tee-off, Pat has to find whoever hasn't
finished betting, chase them, and then close. Closing is irreversible in practice — it publishes
everyone's wagers to everyone.

### 6.1 The chase list · P0
- [ ] Navigator runs `docs/admin/phase-compliance.sql` in the SQL editor (paste the whole file)
- [ ] The last line reads **`Closing Phase 1 — TEXT THESE PEOPLE: Devin Arand (3 of 5 picks)`**
      — one name, and it is his
- [ ] **Nobody else appears**, even though 13 of 14 people are short of their entry fee. That is
      the #98 fix: before Phase 2 opens, being off your exact total is normal, not a reason for
      a text. The table above the line still shows every number.
- [ ] **Pat reads the output.** Can he tell who to text without help? If not, that's a finding —
      this query is his only chase tool.

> Zero placements never flags on the minimum. Putting everything in one phase is explicitly
> allowed (Q2), so "no wagers this phase" isn't non-compliance — and the minimum is a
> tournament-wide count anyway (#96), so Devin's 3 picks are a heads-up here, not yet a breach.
> He is only formally short if he stops; his Phase 2 slate takes him to 8.

### 6.2 Chase one straggler live · P1
- [ ] Leave Devin non-compliant on purpose — Q3 says whatever stands, stands, and Act 9 needs him
- [ ] Confirm nothing is auto-voided or auto-corrected

### 6.3 Close · P0
- [ ] Pat uploads `2-phase1-closed-r1-results.xlsx` — this both closes Phase 1 **and** brings
      the Round 1 results
- [ ] Report shows 13 bets updated, 57 picks updated (all of Phase 1)

### 6.4 The reveal · P0
- [ ] `/bets` — Phase 1 bets now read **Closed**, all stake inputs gone
- [ ] **Every bettor's name and amount is now visible on every pick**, with a per-pick total
- [ ] **Bets nobody wagered on are still shown** — a closed bet with no action stays visible
- [ ] Check from a non-admin window (Jake Kohne): he sees everyone's wagers now, where minutes
      ago he saw nothing

**This is the big social moment of the weekend — get Pat's read on whether it feels right.**

- [ ] Try to place a wager on a closed bet → *"This bet is not open for wagering."*

---

## Act 7 · Thursday night — Round 1 results · 20 min · P0

**Why this matters.** The first time money appears. Everyone will refresh this page all night.

**Behind the scenes.** There's no stored "resolved" status. Each pick carries a result, and the
UI simply shows it once it isn't `pending`. A bet whose picks have all settled reads "Resolved".
The app never decides anything — every verdict comes from Pat's workbook via the `result` column.

### 7.1 The verdicts · P0
The results arrived with the Act 6 upload. Now read them.

- [ ] `/bets` — settled picks carry badges: **✓ hit · ✕ miss · = push · ∅ void**
- [ ] Bets with every pick settled read **Resolved** rather than Closed
- [ ] Phase 2 is still hidden and entirely pending

### 7.2 The void · P0 — *the case that behaves differently*
`Match - Round 1` between Brendan Nulsen and Austin Davis came back **Void** — treat it as a
withdrawal.

- [ ] Both picks in that match show **∅ void**
- [ ] Find a bettor who had money on it (Ethan Kipping, Mike Vemmer, Dustin Scheller) and open
      their `/my-bets`

**Why void is not push, and why it matters:** a **push** returns the stake *inside* the payout
math and leaves the pool alone. A **void** takes the wager out of the game entirely — no
theoretical credit, the stake is refunded out of band, and **the pool itself shrinks by that
amount**. It's the only thing that changes the size of the pot, so if it's wrong, everyone's
payout is wrong.

### 7.3 Partial results · P1
- [ ] Pat edits his sheet to blank one result back to `Pending`, re-uploads
- [ ] That pick's badge disappears; everything else is untouched; the bet stops reading Resolved
- [ ] Set it back and re-upload

**Why:** on tournament night results trickle in over hours. Pat must be able to upload three
times as verdicts land.

### 7.4 The money so far · P0
- [ ] `/my-bets` shows a **theoretical payout** now that results exist
- [ ] Pat opens `/admin/view` — everyone's wagers, the pool, the sum of theoretical payouts, and
      the self-pick review flags, all in one table
- [ ] **Check one push by hand.** Find a wager on a pushed pick — its theoretical payout should
      be exactly the stake back.
- [ ] **Check one hit by hand.** At +150, a $4 wager should read $10.00 ($4 stake + $6 winnings).

---

## Act 8 · Friday night — Phase 2 opens · 15 min · P0

**Why this matters.** The one moving part nobody has rehearsed. Phase 1 has to stay visible and
settled while a brand-new menu appears alongside it, and everyone's leftover budget has to carry
across correctly.

### 8.1 Open it · P0
- [ ] Pat uploads `3-phase2-open.xlsx`
- [ ] `/bets` now shows **both** phases: Phase 1 closed and revealed, Phase 2 open with stake
      inputs
- [ ] Phase 2's tournament bets carry their own post-Round-2 prices

### 8.2 The budget carries · P0
- [ ] In each hand-driven window, check the remaining budget equals entry fee minus Phase 1
      spend (Dan $15 left of $40 · Jake $10 of $25 · Casey $20 of $50 · Pat $12 of $30)
- [ ] Try to exceed it → the same over-entry rejection as Act 4.11
- [ ] **The self-bet cap spans both phases.** Dan is already at his $10 — betting on himself in
      Phase 2 must still be refused. Try it.

### 8.3 Someone who's already all-in · P1
- [ ] Confirm a bettor who spent their whole entry in Phase 1 simply can't place in Phase 2.
      **That's correct, not a bug** (Q2) — but check the message explains it rather than looking
      broken.

### 8.4 Place Phase 2 wagers · P0
- [ ] Navigator: run `supabase/dry-run/30-phase2-placements.sql` for the bulk bettors
- [ ] Hand-driven bettors place their Phase 2 slates in the browser, each closing out at exactly
      their entry fee
- [ ] Short on time? Run `supabase/dry-run/35-phase2-handdriven-fallback.sql` instead

---

## Act 9 · Saturday morning — Phase 2 closes · 10 min · P1

### 9.1 The exact-total sweep · P0
- [ ] Run `docs/admin/phase-compliance.sql` again
- [ ] Everyone should read exact **except Devin Arand at $18 of $20**
- [ ] **Ask Pat:** it's ten minutes to tee-off and Devin is $2 short and not answering. What
      happens? (The documented answer is Q3: whatever stands, stands. Confirm he agrees, because
      it means Devin's $20 entry funds a pool against only $18 of wagers.)

### 9.2 Close · P0
- [ ] Pat uploads `4-phase2-closed-final.xlsx`
- [ ] Every bet in the book is now closed and revealed
- [ ] *Match - Round 3* came back **Void** — the second withdrawal, this time in Phase 2

---

## Act 10 · Saturday night — payouts and reconciliation · 25 min · P0

**This is the act that decides whether the app ships.** Everything else is convenience. If the
payout numbers don't match Pat's workbook, the app cannot be used to settle real money.

**Behind the scenes.** Each wager's theoretical payout is computed from its **stored** odds and
its pick's result: a hit pays stake plus winnings, a push pays the stake back, a miss and a void
pay nothing. Those are summed per person. Then the pool — entry fees **minus every voided
stake** — is split in proportion to each person's share of the total theoretical.

### 10.1 Unlock the results page · P0
- [ ] Navigator, in SQL:
      ```sql
      UPDATE public.tournaments SET status = 'completed' WHERE year = 2026;
      ```
- [ ] **"Results" appears in the navigation.** Before this, `/results` showed an empty state.

**Ask Pat to do this himself.** He can't — there's no button anywhere in the app. **Log it.**
It's the last manual step of the entire tournament and it currently requires the database. Either
it needs a control, or it needs to be written into a runbook Pat can follow.

### 10.2 Read the board · P0
- [ ] `/results` shows the winner spotlight and the full table: entry, theoretical, actual, P/L
- [ ] **Steve Esswein** appears with $0 and a full-entry loss — he paid but never wagered. Ask
      Pat whether that's the behaviour he wants if it happens for real.
- [ ] The pool figure equals entry fees minus the voided stakes, not entry fees alone
- [ ] Nothing reads "pending"

### 10.3 Reconcile against Pat's workbook · P0 — *the crown jewel*
- [ ] Navigator exports the ledger:
      ```sql
      SELECT u.display_name, pk.sheet_pick_id, pk.label, p.amount,
             p.odds_at_placement, pk.result
        FROM public.bet_placements p
        JOIN public.bet_picks pk ON pk.id = p.pick_id
        JOIN public.users u ON u.id = p.user_id
       WHERE p.deleted_at IS NULL
       ORDER BY u.display_name, pk.sheet_pick_id;
      ```
- [ ] Pat runs that ledger through his Excel workbook
- [ ] **Compare to the cent.** If you used the fallback sheets and slates, the expected answer is
      in [Appendix A](#appendix-a--the-expected-payout-table).

**Any discrepancy is a P0, full stop.** Note which direction it goes and on whose row — a
mismatch on a *voided* wager means the pool adjustment differs; a mismatch on a *pushed* wager
means the push convention differs; a mismatch everywhere means the split itself differs.

### 10.4 Cents and payment · P1
- [ ] Payouts display cents. Ask Pat how he actually pays $29.03 over Venmo, and whether the app
      should round or show a suggested payment column.

---

## Act 11 · Leaderboard and the mobile pass · 15 min · P1

### 11.1 The leaderboard · P2
- [ ] `/leaderboard` — expect an **empty state**, since Sprint 8's Google service account isn't
      set up yet. That's the known state, not a bug.
- [ ] Confirm with Pat that his "Sportsbook Leaderboard" tab exists with the eight columns, and
      that he'll share it with a service account
- [ ] **Also ask:** back in July he suggested dropping the participant leaderboard entirely. If
      that's still his view, Sprint 8 and the whole Google Sheets integration can be cut.

### 11.2 Mobile · P1
**Nearly everyone will use this app only from a phone, standing on a tee box.** On Pat's actual
phone, on cellular:
- [ ] `/bets` — can he read the odds, hit the stake input, and complete the two-tap confirm
      one-handed?
- [ ] The bet-slip bar doesn't cover the thing he's trying to tap
- [ ] `/my-bets`, `/dashboard`, `/results`
- [ ] The reveal table on a closed bet — does it scroll or overflow?
- [ ] `/admin/import` — **can Pat upload a spreadsheet from his phone?** If not, that's worth
      knowing now, because Friday night's upload might happen from a hotel room.

---

## Act 12 · Debrief · 20 min · P0

Do this while Pat is still in the room. These are the questions that have been blocking work.

### 12.1 The open decisions · P0
- [x] ~~**The 5–10 span**~~ — answered Jul 31: minimum 5 per tournament, maximum 10 per phase
      (shipped, Sprint 22 / #96)
- [x] ~~**The non-player cap**~~ — answered Jul 31: no stricter limit (PRD §12 A15)
- [ ] **Entry collection** — is "$20 from the deposit, the rest by Venmo" firm?
- [ ] **Tournament dates** — Sept 24–26 confirmed? (An earlier draft said 24–27.)
- [ ] **"Non-Goals — see word doc"** — what did that refer to? The referenced document has no
      such section.

### 12.2 Triage · P0
- [ ] Walk the issue log together and assign every row a tier: **P0 blocker** / **P1 before
      Sept 10** / **P2 nice-to-have**
- [ ] Count the P0s. That number is the honest answer to "are we on track?"

### 12.3 The September plan · P1
- [ ] Walk the itinerary: Phase 1 open before the tournament → close Thursday morning →
      Round 1 results Thursday night → Phase 2 open Friday night → close Saturday morning →
      final results Saturday night → flip the tournament to completed
- [ ] **Ask Pat to say the four upload moments back from memory.** If he can't, the runbook
      (a Sprint 9 deliverable that doesn't exist yet) is a P0.
- [ ] Who's the backup if Pat has no signal on Saturday morning?

---

# Part 2 — After the session

**Andrew, solo, ~15 minutes.** Don't skip this — the simulated accounts are real, login-able
accounts sitting in production.

- [ ] Anything worth keeping from the dry-run data is exported first (nothing expires — you can
      leave it overnight and study it)
- [ ] Run `supabase/dry-run/90-teardown.sql`
- [ ] Its verification query returns: sim accounts 0 · placements 0 · real accounts 3 ·
      status `upcoming`
- [ ] Finish the issue log — every fast-capture line becomes a full row
- [ ] Paste the completed table into Claude Code: *"file these as GitHub issues"*
- [ ] Update `docs/ROADMAP.md`: flip Sprint 9's row and the phase rows the session actually
      verified, with today's date
- [ ] Record Pat's answers to the five open decisions in `docs/OUTSTANDING_DECISIONS.md`

---

## Appendix A — The expected payout table

Produced by `bash scripts/dry-run-verify.sh`. **This holds only if you used the fallback
spreadsheets *and* the fallback placement slates for everyone.** If wagers were placed by hand in
Act 4 or 8 the amounts will differ — in that case reconcile against Pat's workbook instead, and
use this only to sanity-check the shape (pool = entries − voids, and every dollar paid out).

```
Entry fees collected  $425
Voided stakes        −$32
Pool (void-adjusted)  $393
Σ theoretical         $628.67

Bettor              Entry      Theo   Refund    Actual       P/L
────────────────────────────────────────────────────────────────
Casey Sideline        $50   $107.10    $3.00    $66.95   +$19.95
Mike Vemmer           $50    $68.87    $6.00    $43.05    −$0.95
Alex Leslie           $40    $59.07    $0.00    $36.92    −$3.08
Dan Mercer            $40    $58.87    $2.00    $36.80    −$1.20
Pat Leicht            $30    $46.53    $2.00    $29.09    +$1.09
Jake Kohne            $25    $46.43    $2.00    $29.03    +$6.03
Ethan Kipping         $30    $44.87    $4.00    $28.05    +$2.05
Mike Yenzer           $20    $42.43    $0.00    $26.53    +$6.53
Andrew Long           $20    $38.13    $3.00    $23.84    +$6.84
Rob Vemmer            $25    $31.83    $2.00    $19.90    −$3.10
Garrett Klenke        $20    $29.93    $2.00    $18.71    +$0.71
Devin Arand           $20    $28.73    $0.00    $17.96    −$2.04
Dustin Scheller       $35    $25.87    $6.00    $16.17   −$12.83
Steve Esswein         $20     $0.00    $0.00     $0.00   −$20.00
```

Three properties must hold no matter whose numbers you use:

1. **Pool = entry fees − voided stakes.** $425 − $32 = $393.
2. **Every dollar of the pool is distributed.** The Actual column sums to exactly the pool.
3. **P/L = actual + refunds − entry.** A voided stake came back, so it can never count as a loss.

## Appendix B — Command reference

| What | Command |
|---|---|
| Rehearse everything locally | `bash scripts/dry-run-verify.sh` |
| Unit tests | `npm run test` |
| Regenerate the spreadsheets | `node --experimental-strip-types scripts/make-dry-run-sheets.ts` |
| Mint a login, no email | `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SITE_URL=… node --experimental-strip-types scripts/dev-magiclink.ts <email>` |
| Stop sessions expiring | `SESSION_TIMEBOX_HOURS=0 bash scripts/prod-auth-config.sh --apply` |
| The chase list | `docs/admin/phase-compliance.sql` |

**SQL, in order:** `00-reset` → `10-accounts` → *(Act 3)* `20-phase1-placements` →
*(fallback)* `25-phase1-handdriven-fallback` → *(Act 8)* `30-phase2-placements` →
*(fallback)* `35-phase2-handdriven-fallback` → *(after)* `90-teardown`.
All in `supabase/dry-run/`.

**Spreadsheets, in order:** `1-phase1-open` → `1b-phase1-repriced` →
`2-phase1-closed-r1-results` → `3-phase2-open` → `4-phase2-closed-final`, plus `X-broken` and
`X-results-on-open` for Act 3.4. All in `docs/dry-run/sheets/`.

## Appendix C — Where each rule is written down

| Rule | Source |
|---|---|
| The money rules (§7) and enforcement timing (§8.1) | `docs/PRD.md` |
| The five categories, void semantics, pick→player matching | `docs/adr/0001-bet-pick-architecture.md` |
| Pari-mutuel math and the worked example | `docs/PRD.md` §5, `lib/payouts.ts` |
| Every error string quoted in Act 4 | `lib/validation.ts` |
| The spreadsheet column contract | `docs/PRD.md` §8.2, `lib/import.ts` |
| The still-unresolved questions | `docs/OUTSTANDING_DECISIONS.md` |
