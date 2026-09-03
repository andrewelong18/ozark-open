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

## Late August — pay for Pro (target: Monday Aug 24)

**Decided Aug 9, 2026 ([#18](https://github.com/andrewelong18/ozark-open/issues/18)):** upgrade to
Supabase Pro for September, deliberately **late in August** so it's one billed month rather than
two. Everything in this section is a dashboard action — there is no CLI or MCP tool that changes a
billing plan.

**What's actually at risk.** Free-tier projects pause after **1 week of inactivity**, and *a paused
project runs no cron jobs*. Sprint 11's save states run as a `pg_cron` job (`ozark-snapshot`, every
6 hours), so a pause stops the automatic backups **silently** — nothing on any screen looks wrong.
Production is near-idle (3 accounts, ~10 requests a week) with 46 days to go, so this is the likely
case, not the unlucky one. The free tier also has no automated backups at all, which is why
snapshots exist.

*Verified Aug 9, 2026:* the project is `ACTIVE_HEALTHY`, `ozark-snapshot` is scheduled and `active`,
and it last fired successfully at 18:00 UTC. Nothing has gone wrong **yet** — the job was only
scheduled that day. The risk here is entirely ahead of us, which is the point: when it does bite,
this is what you'll have to compare against.

- [ ] **Upgrade the organization to Pro** — Supabase dashboard → Organization → Billing.
      **$25/month, charged per organization**, and it includes $10 of compute credits, which covers
      the one Micro instance this project runs. So the September bill is ~$25.
      *Don't buy Point-in-Time Recovery.* It's a separate $100/month add-on and the daily backups
      below are more than enough for a 32-person pool.

- [ ] **Confirm the three things you're paying for**, in the dashboard:
      1. The project is no longer flagged for pausing.
      2. **Database → Backups** lists daily backups (7-day retention).
      3. Logs now retain 7 days instead of 1 — which is what you'd need if a September wager is
         disputed.

- [ ] **Re-check that the snapshot job is still firing** — *scheduled* and *firing* are different
      things, and only the second one is a backup. In the SQL editor:
      ```sql
      SELECT jobname, status, return_message, start_time
        FROM cron.job_run_details d JOIN cron.job j USING (jobid)
       ORDER BY start_time DESC LIMIT 5;

      SELECT created_at, trigger FROM public.snapshots WHERE trigger = 'cron'
       ORDER BY created_at DESC LIMIT 5;
      ```
      You want `succeeded` rows in the first and recent timestamps in the second. If the second is
      empty or stale, the project was paused and the job stopped — it resumes on its own now that
      pausing is off, but confirm it before moving on. Full context in
      [`DATA_SAFETY.md`](DATA_SAFETY.md) §The schedule.

- [ ] **Set a reminder to downgrade in early October**, once `/results` is final and you've run the
      `after-payouts` export. One month is the decision; twelve is what happens if nobody writes it
      down.

### Between now and the upgrade — the project is still on the free tier

The gap from early August to the upgrade is the exposed stretch: still free tier, still near-idle,
so the project can pause and the automatic save states can stop.

- [ ] **Sign in to the app at least once every ~5 days** until the upgrade is done, and don't
      assume snapshots are accruing in that window — check `public.snapshots` if it matters.

      **A plain uptime pinger does not work here**, and it's worth knowing why before you set one
      up and trust it. `middleware.ts` calls `supabase.auth.getUser()`, which makes **no network
      call at all** when the request carries no session cookie. An anonymous ping to any page can
      therefore produce plenty of Vercel traffic and **zero** Supabase activity — you'd have a
      green uptime dashboard and a paused database. It has to be a real signed-in page load.

- [ ] **Take a manual export** if you make any significant change before the upgrade:
      `bash scripts/db-export.sh "$SUPABASE_DB_URL" pre-pro`. Cheap insurance while the automatic
      net is unreliable.

---

## Week of (target: Monday Sept 21)

- [ ] **Wake the Supabase project.** On Pro (see Late August above) the project no longer sleeps,
      so this should be a formality — but confirm it anyway: open the Supabase dashboard, check the
      project is *Active*, then load the app and sign in. Do this **before** anything below — every
      other step assumes a database that answers.
      *(If the Pro upgrade didn't happen, this step is load-bearing rather than a formality: a
      free-tier project sleeps after a week of inactivity and the first request after a sleep can
      take a minute or fail outright. Wake it, and expect no automatic snapshots to have been taken
      while it slept.)*

- [ ] **Send people `https://ozark-open.com` — not a `.vercel.app` link.** Since Aug 23, 2026
      the app forces this itself: every other production alias 308s to `ozark-open.com`, and the
      magic-link email is built from it. Paste the wrong URL and a member is bounced to the right
      one rather than stranded on a second domain — but keep sending the real one anyway, because
      the project has Vercel SSO on *"all except custom domains"*, and two of its other URLs —
      the `-nerdyandyproject` and `-git-main` aliases — hit that wall **before** the redirect can
      run, bouncing anyone who isn't on Andrew's Vercel team to a Vercel login page. Those are the
      URLs you get by copying from the Vercel dashboard, so they're easy to paste into a group text
      by mistake. A member who hits one will report "the app is asking me to log into something
      called Vercel", which reads like a broken invite.

- [ ] **Confirm the magic link points at `ozark-open.com`** — one read-only command:
      ```bash
      SUPABASE_ACCESS_TOKEN=sbp_... bash scripts/auth-url-check.sh
      ```
      It reads the Supabase Site URL the email template builds its link from. This is a dashboard
      setting no test or build can see: it sat on the old `.vercel.app` address for weeks while the
      app served `ozark-open.com`, mailing every member a link to a domain they were never given.

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

## Monitoring — the one thing that watches the app for you

`https://ozark-open.com/api/health` runs the reads the app itself depends on and answers **200**
when they all work, **503** when one doesn't. It is public — no session needed — and returns no
data, only check names, pass/fail and timings.

Point any uptime monitor at it (UptimeRobot's free tier is plenty; 5-minute interval, alert on
non-200). Two rules:

- **Use `ozark-open.com`.** A `.vercel.app` alias 308s to the canonical host before the route runs,
  and two of them sit behind Vercel SSO — a monitor pointed at one measures Vercel's login page.
- **Set it up before the week of the tournament**, not during. It is worth most in the hour after a
  deploy, and there is no reason to wait.

Why it isn't a plain ping: on Aug 31 the dashboard shipped a query for a column whose migration
hadn't been applied. Vercel was green, Supabase was green, and every member got an error card. A
ping on `/` would have been green the whole time. This endpoint checks the *schema the code
expects* — the tournament row and its rule and clock columns, the dashboard's `bets` read
including `opened_at`, the activity feed's function, and the entry-collection columns — so a deploy
that outruns its migration is red within one poll.

When it's red, open it in a browser. The failing check names itself and carries the database's own
message, which names the missing column:

```json
{ "ok": false, "checks": [ { "name": "bets_read", "ok": false,
  "error": "column bets.opened_at does not exist" } ] }
```

That is a migration to apply, not a code change (`docs/AGENT_AUTOMATION.md`).

## If something goes wrong

| Symptom | What it usually is |
|---|---|
| Anything at all is broken | Load `/api/health` first — 30 seconds, and it names the failing read. |
| Nobody can sign in | Project asleep, or magic-link email failing. Dashboard first, then Resend. |
| A member says "I can't bet" | They're not approved, or they're revoked. `/admin/people`. |
| A pick doesn't link to a golfer | Name mismatch between the sheet and their display name. Fix the sheet, re-upload — the §7 self-bet rules depend on that link. |
| Payouts look too high | Something is still `pending`. `/admin/close` names it. |
| Betting is closed and shouldn't be | The phase deadline passed. Push it out on `/admin/close` — no re-upload needed. |
| Betting is open and shouldn't be | The deadline hasn't fired. *Close now*. A sheet marked `closed` does not stop wagering on its own. |

Anything not on this list: write it down, keep moving, and file it afterwards. Nothing during the
weekend needs a code change.
