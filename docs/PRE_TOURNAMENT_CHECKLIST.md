# Pre-Tournament Checklist — what an admin does, and when

**Ozark Open, September 24–26, 2026.** This is the tournament weekend as a list of things to do,
in order, with the exact page or command for each one. It is written to be executed by an admin
who does not touch code, because that is Sprint 9's bar: *the weekend runs without an admin needing
to touch code or ask Andrew a question.*

Work top to bottom. Tick boxes as you go — `- [x]`.

- **The itinerary it implements:** [`PRD.md` §8](PRD.md) (lifecycle) and §8.1 (which rules bite when).
- **The four uploads** are the spine of the whole weekend. Everything else is checking and chasing.
- **Where things live:** `/admin/import` (publish the menu) · `/admin/people` (who's in) ·
  `/admin/close` (the clock, the chase list, the final unlock) · `/admin/view` (the View-sheet
  replica) · `/admin/rules` (fees, caps, pick counts).

---

## The four uploads, at a glance

Every one of them is the same spreadsheet, re-uploaded to `/admin/import`. Upsert by `bet_id` /
`pick_id`, so re-uploading is normal and idempotent (ADR 0001).

| # | When | What changed in the sheet |
|---|---|---|
| 1 | Week of, before Phase 1 opens | Phase 1 bets `open`; Phase 2 bets `hidden` |
| 2 | **Thursday night** | Round 1 `result` per pick (Hit/Miss/Push/Void); those bets `closed` |
| 3 | **Friday night** | Phase 2 bets flipped `hidden` → `open`, Tournament odds updated |
| 4 | **Saturday night** | Final `result` per pick; every bet `closed` |

Uploads never touch anybody's wagers. Only participants write those, through the app.

---

## Week of (target: Monday Sept 21)

- [ ] **Wake the Supabase project.** Free-tier projects sleep after inactivity, and the first
      request after a sleep can take a minute or fail outright. Open the Supabase dashboard, confirm
      the project is *Active*, then load the app and sign in. Do this **before** anything below —
      every other step assumes a database that answers.
      *(If sleeping projects are still a worry the week of, #18 is the open call on paying for Pro
      for September.)*

- [ ] **Send people `https://ozark-open.com` — not a `.vercel.app` link.** Both
      `ozark-open.com` and `ozark-open-sportsbook.vercel.app` are open to the public and work
      fine (checked Aug 9, 2026). But the project has Vercel SSO on *"all except custom
      domains"*, and two of its other URLs — the `-nerdyandyproject` and `-git-main` aliases —
      bounce anyone who isn't on Andrew's Vercel team to a Vercel login wall. Those are the URLs
      you get by copying from the Vercel dashboard, so it is an easy link to paste into a group
      text by mistake. A member who hits it will report "the app is asking me to log into
      something called Vercel", which reads like a broken invite.

- [ ] **Verify magic-link email works end to end.** Not "the login page loads" — an actual email,
      to an actual inbox, clicked:
      1. Open `/login` in a private window.
      2. Enter your own address. Send the link.
      3. **The email arrives within a minute** (it goes through Resend, not Supabase's built-in
         sender, which is rate-limited to a handful an hour — PRD §10).
      4. Click it. You land signed in, not on "Email link is invalid or has expired".
      Do this from a **phone**, on cell data, not just the laptop. That's how it will be used.
      If nothing arrives: check Resend's dashboard for the send, then Supabase → Authentication →
      URL Configuration for the redirect URL.

- [ ] **Everyone has an account and is approved.** `/admin/people` is the whole funnel, worst-first:
      *No account* → *Not onboarded* → *Needs approval* → *Approved*.
      - [ ] Paste the invite list into the bulk box so everyone expected is on the page.
      - [ ] Chase the *No account* and *Not onboarded* rows — those people cannot bet, and no amount
            of admin clicking fixes it. Text them.
      - [ ] Approve everyone else with the right **entry fee** and the **playing golfer** flag.
            A non-player still bets; the flag is what exempts them from the self-bet rules.

- [ ] **The house rules match what everyone agreed.** `/admin/rules` — entry-fee bounds, max single
      bet, self-bet cap, pick minimum, max picks per phase. These are read from the tournament row
      everywhere in the app; nothing is hardcoded. Check them once now rather than arguing on
      Thursday.

- [ ] **Upload #1 — publish the menu.** `/admin/import`, Phase 1 bets `open`, Phase 2 `hidden`.
      Read the **import report** afterwards, all of it:
      - [ ] Bets and picks created/updated match what you expect.
      - [ ] **Unmatched pick names** — every one is a golfer whose picks won't link to their
            profile, and whose self-bet cap, self-pick flag and opponent block silently won't apply.
            Fix the spelling in the sheet to match their display name and re-upload.
      - [ ] Warnings about odds changing on a bet that already has placements.

- [ ] **Set the two deadlines.** `/admin/close` → *Phase clock*. Defaults are Round 1 and Round 3
      tee-off — **Thu Sept 24, 11:00 CT** and **Sat Sept 26, 11:00 CT** (PRD §8). Times are Central,
      the same clock as the tee sheet. Turn on the members' countdown while you're there.

- [ ] **Walk the member's view.** Sign in as yourself, on your phone, and check `/bets`,
      `/my-bets` and `/dashboard` look right. You are about to ask 30 people to do this.

- [ ] **📦 Run the first database export.**
      ```bash
      bash scripts/db-export.sh "$SUPABASE_DB_URL" before-phase-1
      ```
      Read `MANIFEST.txt` — row counts, and `pool = entry_fees − voided_stakes`. Then **copy the
      folder off the machine**. Full instructions and what to do when it complains:
      [`DATA_SAFETY.md`](DATA_SAFETY.md). This is the floor you rebuild from if the weekend goes
      wrong, and the free tier has no automated backups.

---

## Day before (Wednesday Sept 23)

- [ ] **Chase the stragglers.** `/admin/close` → the chase list, which is phase-aware: before a
      Phase 1 close it chases the **pick minimum only**, because being short of your entry fee is
      normal while Phase 2 is still ahead. Copy the one-line "text these people" and send it.
- [ ] **Confirm the deadlines** one more time — they're the thing that closes betting, and they're
      editable right up to the moment they fire.
- [ ] **Post the link** in the group thread with a nudge to sign in *tonight*, not at the first tee.
      Sessions are long-lived, so anyone who signs in this week stays signed in through Saturday.
- [ ] **Confirm the Sheets mirror.** `/leaderboard` should render Pat's *Sportsbook Leaderboard*
      tab. If it says "No standings yet", the sheet isn't shared or the service account isn't
      configured (#66) — sort it now, not on Thursday.

---

## Each morning

- [ ] **Wake the app before the group does.** Load `/dashboard` on your phone. First request after
      an idle night is the slow one; let it be yours.
- [ ] **The chase list, one last time**, before the phase's deadline fires. `/admin/close`.
- [ ] **Let the clock close the phase.** You do not have to do anything at 11:00 — the deadline
      does it. If you need to close early, *Close now*; if the tee sheet slips, push the deadline
      out. Neither touches a bet row, so both are reversible (ADR 0001 §5a).
- [ ] **Sanity-check the pool.** `/admin/view` — every bettor, what they wagered, what it's worth.
      This is the View sheet, without a database.

---

## Each night

**Thursday night** — after Round 1 is scored:

- [ ] **Upload #2.** Results per pick, those bets `closed`. Read the import report.
- [ ] Spot-check on `/bets` → *Closed*: the reveal shows who backed what and for how much. That's
      the social payoff of the whole weekend; if it's empty, stop and find out why.
- [ ] `/my-bets` shows members their theoretical payouts.
- [ ] *(Optional but cheap)* `bash scripts/db-export.sh "$SUPABASE_DB_URL" thursday-night`

**Friday night** — Phase 2 opens:

- [ ] **Upload #3.** Phase 2 bets `hidden` → `open`, Tournament odds updated.
- [ ] Confirm on `/bets` that Phase 2 is taking wagers and Phase 1 is still readable as closed.
- [ ] Tell the group Phase 2 is live. **Remind them the total must land exactly on their entry
      fee** — that rule is only checkable now, and it's what the Saturday chase is about.

**Saturday night** — the end:

- [ ] **Upload #4.** Every remaining result, every bet `closed`.
- [ ] **Check `/admin/close` says nothing is pending.** The *Publish final results* button stays
      disabled while any pick has no result — deliberately. Publishing early splits the pool across
      only the settled wagers, so every payout reads too high and **nothing on the page looks
      wrong** (PRD §8.1 / #108). Do not work around it; fix the sheet and re-upload.
- [ ] **Publish final results.** `/admin/close` → *Publish final results*. This is what reveals
      `/results` to everyone.
- [ ] **Check the money before you announce it.** `/results`:
      - [ ] No *Provisional* banner.
      - [ ] `Pool $X` = entry fees − voided stakes.
      - [ ] The winner spotlight is showing.
- [ ] **📦 Run the final database export.**
      ```bash
      bash scripts/db-export.sh "$SUPABASE_DB_URL" after-payouts
      ```
      `pending_picks` must be **0** in the manifest. This one is the permanent record — copy it
      somewhere that isn't your laptop. [`DATA_SAFETY.md`](DATA_SAFETY.md).
- [ ] **Settle up on Venmo.** The app never touched payments and never will (PRD §10); `/results`
      is the number to pay against.

---

## If something goes wrong

| Symptom | What it usually is |
|---|---|
| Nobody can sign in | Project asleep, or magic-link email failing. Dashboard first, then Resend. |
| A member says "I can't bet" | They're not approved, or they're revoked. `/admin/people`. |
| A pick doesn't link to a golfer | Name mismatch between the sheet and their display name. Fix the sheet, re-upload — the §7 self-bet rules depend on that link. |
| Payouts look too high | Something is still `pending`. `/admin/close` names it. |
| Betting is closed and shouldn't be | The phase deadline passed. Push it out on `/admin/close` — no re-upload needed. |
| Betting is open and shouldn't be | The deadline hasn't fired. *Close now*. A sheet marked `closed` does not stop wagering on its own. |

Anything not on this list: write it down, keep moving, and file it afterwards. Nothing during the
weekend needs a code change.
