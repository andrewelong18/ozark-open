# Dev Testing Cheat Sheet

How to click through the app — including the Sprint 16 onboarding + admin-approval flow —
with pre-seeded dummy accounts and **without waiting on real email**. Two setups:

- **[Option A — Hosted project, no Docker](#option-a--hosted-project-no-docker)** ← use this if you don't want to run Docker
- **[Option B — Local stack with Docker + Inbucket](#option-b--local-stack-docker--inbucket)**

Both share the same [dummy accounts](#the-dummy-accounts).

---

## Option A — Hosted project, no Docker

Run the app **locally** but pointed at your **hosted Supabase project**. Nothing to install
beyond the app's own deps.

> ⚠️ **Use a dev / throwaway Supabase project, not your live production one.** The seed
> creates real, login-able accounts. If you only have one project, that's fine for a
> pre-launch app — just run the [teardown](#reset--teardown) when you're done.

### 1. Point the app at hosted
Copy `.env.local.example` → `.env.local` and fill in from **Dashboard → Project Settings → API**:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2. Allow the local redirect (one-time, in the dashboard)
**Dashboard → Authentication → URL Configuration → Redirect URLs** → add `http://localhost:3000/**`.
Without this, the magic-link callback is rejected.

### 3. Make sure migrations are applied, then get accounts in place
Apply the migrations if you haven't (`npx supabase db push`, or paste `supabase/migrations/*.sql`
in order into the **SQL editor**). Then, in the hosted **SQL editor**, run:
1. `supabase/seed-sample-phase1.sql` — an open bet menu to place on.
2. `supabase/seed-dev-accounts.sql` — the five dummy accounts (see the table below).

*Prefer not to seed `auth.users` directly?* Skip the accounts seed and go **organic**: log in
with real emails you control — Gmail aliases like `you+admin@gmail.com`, `you+approved@gmail.com`
all land in your one inbox and each becomes its own account. Then promote one to admin in the
SQL editor (`update public.users set is_admin = true where email = 'you+admin@gmail.com';`) and
approve the rest from `/admin/participants`.

### 4. Run the app
```bash
npm run dev
# open http://localhost:3000
```

### 5. Log in — two ways, no waiting
- **Real email:** enter a seeded/aliased email on `/login`; Supabase emails you the link
  (built-in SMTP is rate-limited to a few per hour).
- **No email at all:** mint a login link with the service_role key and paste it into your browser:
  ```bash
  SUPABASE_URL=https://<your-ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service_role key, Dashboard → Settings → API> \
  node --experimental-strip-types scripts/dev-magiclink.ts approved@ozark.test
  ```
  It prints an `action_link` — open it and you're signed in as that account. The account must
  already exist (seeded, or logged-in once). **Keep the service_role key out of git and out of
  any `NEXT_PUBLIC_*` var** — it's admin-level.

---

## Option B — Local stack (Docker + Inbucket)

Everything runs on your machine; magic links are caught in a local inbox, so no real email and
no rate limits.

```bash
npx supabase start          # needs Docker; boots Postgres + Auth + Studio + Inbucket
#   → copy the printed API URL + anon key into .env.local (URL is http://127.0.0.1:54321)
npx supabase db reset       # applies every migration
# then load the seeds (SQL editor at http://localhost:54323, or psql):
#   supabase/seed-sample-phase1.sql  +  supabase/seed-dev-accounts.sql
npm run dev
```
Open **http://127.0.0.1:3000**, enter a seeded email on `/login`, then open **Inbucket at
http://localhost:54324** and click the caught link.

### Local ports
| Service | URL |
|---|---|
| App | http://127.0.0.1:3000 |
| Inbucket (email catcher) | http://localhost:54324 |
| Studio | http://localhost:54323 |
| API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

---

## The dummy accounts

Re-running `seed-dev-accounts.sql` resets all five to exactly these states.

| Email | State | What it's for |
|---|---|---|
| `admin@ozark.test` | Admin · onboarded · approved ($40, player) | Do the approving (`/profile → Participants`) and also place bets. |
| `approved@ozark.test` | Onboarded · approved ($30, player) | A normal bettor — place/edit/remove wagers on `/bets`. |
| `nonplayer@ozark.test` | Onboarded · approved ($20, **non-player**) | Non-playing bettor — exempt from the self-bet cap. |
| `pending@ozark.test` | Onboarded · **no participant row** | The pending-approval state: sees the menu but can't place. Approve from `admin@` to watch them gain betting access. |
| `newbie@ozark.test` | **Un-onboarded** | Forced through the required onboarding flow (set display name → walkthrough → `/bets` view-only). |

**Full happy path in one sitting:** sign in as `newbie@` → complete onboarding → confirm
you're view-only on `/bets`. Then sign in as `admin@` → `/admin/participants` → the newly
onboarded account is under **Awaiting approval** → set an entry fee + player flag →
**Approve to bet**. Back as that account, you can now place a wager.

The accounts are **passwordless** (magic-link only) — there's no password to set.

---

## Reset / teardown

- **Remove the dummy accounts** (hosted or local) — in the SQL editor:
  ```sql
  DELETE FROM auth.users WHERE email LIKE '%@ozark.test';
  ```
  Cascades to their `public.users`, participant rows, and identities.
- **Re-test onboarding as one email:** delete just that account, then re-run the seed.
- **Local full reset:** `npx supabase db reset`, then re-run the two seeds.
- **A truly fresh account:** type any new email on `/login` — signup is open; it's created
  un-onboarded and drops into the onboarding flow.

---

## Gotchas

- **Redirect allow-list (hosted).** `http://localhost:3000/**` must be in the project's
  Redirect URLs or login bounces. (Local stack: `config.toml` already allows it.)
- **Email rate limit.** Hosted built-in SMTP sends only a few auth emails/hour — use the
  `dev-magiclink.ts` link to sidestep it. (Local stack raises the cap to 100 in `config.toml`.)
- **Placing bets works even though the tournament is "upcoming."** The seeded bet menu is
  `open`, and placement only checks that. To light up the dashboard's **Betting Open** badge,
  set the 2026 tournament `status` to `active` in the `tournaments` table.
- **Never point this seed at production.** It writes real accounts into `auth.users`.
- **Local host:** use `127.0.0.1:3000` (matches `site_url`); `localhost:3000` is also allowed.
