# Dev Testing Cheat Sheet

How to click through the app locally — including the Sprint 16 onboarding + admin-approval
flow — **without sending a single real email**. Local Supabase catches magic links in a web
inbox (Inbucket); dummy accounts come pre-seeded in every state.

---

## One-time setup

```bash
# 1. Boot the local Supabase stack (Postgres + Auth + Studio + Inbucket).
#    Needs Docker running and the Supabase CLI (npx works).
npx supabase start
#    → prints an API URL + anon key. Copy them into .env.local:
#        NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#        NEXT_PUBLIC_SUPABASE_ANON_KEY=<the printed anon key>
#        NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000

# 2. Apply migrations + load the seeds.
npx supabase db reset                 # re-applies every migration from scratch
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2-)" \
  -f supabase/seed-sample-phase1.sql \
  -f supabase/seed-dev-accounts.sql
#    (Or paste both files into Studio's SQL editor at http://localhost:54323.)

# 3. Run the app.
npm run dev
```

Then open **http://127.0.0.1:3000** (use `127.0.0.1`, not `localhost` — it matches
`site_url`, so the magic-link callback is allowed out of the box).

### Ports

| Service | URL |
|---|---|
| App (Next.js) | http://127.0.0.1:3000 |
| Inbucket (email catcher) | http://localhost:54324 |
| Supabase Studio | http://localhost:54323 |
| Supabase API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

---

## Logging in without real email

1. Go to `/login` and enter one of the seeded emails below (or **any** email — signup is
   open, and a brand-new email drops you straight into onboarding).
2. Open **Inbucket → http://localhost:54324**.
3. Open the newest message and click the magic link. You're now signed in as that account.

> The seed also sets a password (`devpass`) on each account, so email+password login works
> too if you ever prefer it — but the magic-link-via-Inbucket path above is the norm.

---

## The dummy accounts

Re-running `seed-dev-accounts.sql` resets all five to exactly these states.

| Email | State | What it's for |
|---|---|---|
| `admin@ozark.test` | Admin · onboarded · approved ($40, player) | Do the approving (`/profile → Participants`) and also place bets. |
| `approved@ozark.test` | Onboarded · approved ($30, player) | A normal bettor — place/edit/remove wagers on `/bets`. |
| `nonplayer@ozark.test` | Onboarded · approved ($20, **non-player**) | Non-playing bettor — exempt from the self-bet cap. |
| `pending@ozark.test` | Onboarded · **no participant row** | The pending-approval state: sees the menu but can't place; shows the "pending approval" banners. Approve them from `admin@` to watch them gain betting access. |
| `newbie@ozark.test` | **Un-onboarded** | Forced through the required onboarding flow (set display name → walkthrough → lands on `/bets` view-only). |

**Full happy path in one sitting:** log in as `newbie@` → complete onboarding → confirm
you're view-only on `/bets`. Then log in as `admin@` → `/admin/participants` → the newly
onboarded account is under **Awaiting approval** → set an entry fee + player flag →
**Approve to bet**. Back as that account, you can now place a wager.

---

## Resetting between runs

- **Full reset:** `npx supabase db reset`, then re-run the two seeds. Wipes everything back
  to migrations + seed state.
- **Re-test onboarding as a specific email:** just delete that one account and re-seed, e.g.
  in Studio's SQL editor: `DELETE FROM auth.users WHERE email = 'newbie@ozark.test';` then
  re-run `seed-dev-accounts.sql` (idempotent).
- **Test a truly fresh account:** type any new email on `/login` (e.g. `me@ozark.test`) — no
  seeding needed; it's created un-onboarded.

---

## Gotchas

- **Use `127.0.0.1:3000`, not `localhost:3000`.** The magic-link callback allow-list is keyed
  on `site_url` (`127.0.0.1`). `localhost` is also allow-listed in `config.toml`, but
  `127.0.0.1` is the path of least resistance.
- **Email rate limit.** Default local config caps auth emails at 2/hour, which blocks testing
  several accounts. `config.toml` raises it to 100 for local dev (never affects prod).
- **Placing bets works even though the tournament is "upcoming."** The seeded bet menu is
  `open`, and placement only checks that. To light up the dashboard's **Betting Open** badge,
  flip the 2026 tournament `status` to `active` in Studio (`tournaments` table).
- **This seed is local-only.** `seed-dev-accounts.sql` writes into `auth.users`; never run it
  against a hosted/production Supabase project.
