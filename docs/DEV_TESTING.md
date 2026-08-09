# Dev Testing Cheat Sheet

How to click through the app — including the Sprint 16 onboarding + admin-approval flow —
with pre-seeded dummy accounts and **without waiting on real email**. Two setups:

- **[Option A — Hosted project, no Docker](#option-a--hosted-project-no-docker)** ← use this if you don't want to run Docker
- **[Option B — Local stack with Docker + Inbucket](#option-b--local-stack-docker--inbucket)**

Both share the same [dummy accounts](#the-dummy-accounts).

> **Don't want to click at all?** [`npm run test:e2e`](#the-browser-suite-e2e) walks the whole
> journey in a real browser for you. This page is still the reference for doing it by hand,
> and for the accounts both use.

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
1. `supabase/seed-sample-phase1.sql` — the 13-bet Phase 1 menu.
2. `supabase/seed-dev-accounts.sql` — the five dummy accounts (see the table below).
3. `supabase/seed-e2e.sql` — **needed if you want to place a bet.** See the warning below.

> ⚠️ **The sample menu is entirely CLOSED.** This page used to describe
> `seed-sample-phase1.sql` as "an open bet menu to place on". It never was: all 13 bets are
> seeded `status = 'closed'` with a Round-1 verdict on every pick, which is why
> `scripts/placement-roundtrip.ts` has to open one itself before it can test anything.
> `supabase/seed-e2e.sql` layers on top and opens four of them (and sets the phase deadlines
> into the future, which since Sprint 25 is also required — `wagering_open` is
> `status = 'open'` **and** `now() < the phase's closes_at`).

*Prefer not to seed `auth.users` directly?* Skip the accounts seed and go **organic**: log in
with real emails you control — Gmail aliases like `you+admin@gmail.com`, `you+approved@gmail.com`
all land in your one inbox and each becomes its own account. Then promote one to admin in the
SQL editor (`update public.users set is_admin = true where email = 'you+admin@gmail.com';`) and
approve the rest from `/admin/people`.

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
  It prints a `/auth/callback?token_hash=…&type=magiclink` URL — open it and you're signed in as
  that account. The account must already exist (seeded, or logged-in once). Pass
  `SITE_URL=` if you're pointing at anything other than `http://localhost:3000`; the host in the
  printed link is where the callback runs. **Keep the service_role key out of git and out of
  any `NEXT_PUBLIC_*` var** — it's admin-level.

  > **Use `localhost`, not `127.0.0.1`.** `/auth/callback` redirects to the origin Next derives
  > from the request, and Next normalises that to `localhost`. Open the link on `127.0.0.1:3000`
  > and the session cookie is set on one origin while you land on another, so it's dropped and
  > you arrive back at `/login` reading *"Email link is invalid or has expired"* — which looks
  > exactly like a bad link and isn't one.

  > The script used to print Supabase's `action_link`, which is the legacy
  > `/auth/v1/verify?token=…` URL. That returns the session as a hash fragment, which never
  > reaches a server route, so `/auth/callback` rejected it with *"Login link was missing its
  > token."* Fixed in Sprint 21 (#94) — it now emits the `token_hash` shape the callback verifies.

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
#   + supabase/seed-e2e.sql   ← opens four bets so there's something to place on
npm run dev
```
Open **http://localhost:3000**, enter a seeded email on `/login`, then open **Inbucket at
http://localhost:54324** and click the caught link.

> `npm run test:e2e` does all of the above for you, including starting the stack.

### Local ports
| Service | URL |
|---|---|
| App | http://localhost:3000 (see the origin note above) |
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
you're view-only on `/bets`. Then sign in as `admin@` → `/admin/people` → the newly
onboarded account is under **Awaiting approval** → set an entry fee + player flag →
**Approve to bet**. Back as that account, you can now place a wager.

The accounts are **passwordless** (magic-link only) — there's no password to set.

---

## The browser suite (E2E)

```bash
npm run test:e2e            # everything, ~1 min once the stack is warm
npm run test:e2e -- bets-menu   # one spec, by filename fragment
```

`scripts/e2e-verify.sh` owns the whole thing: it starts the local Supabase stack if it isn't
already up (skipping Studio, realtime and the other services no app path touches), reads the
URL and keys back off it, loads the three seeds, and runs Playwright. **Needs Docker.** First
run pulls images and takes a few minutes; after that it's about a minute.

The suite is **13 specs across 7 journeys**:

| Spec | What it drives |
|---|---|
| `onboarding` | A new member forced through `/onboarding`, landing on a menu they can browse but **not** place on |
| `admin-approval` | `admin@` approves the pending account, sets a fee, and that member can then bet with exactly that budget |
| `placement` | Place → edit → remove through the two-tap confirm, with `/my-bets` re-read after each; plus a §7 violation refused with the server's exact sentence |
| `bets-menu` | The Sprint 24 UX: favourites-first ordering, the stroke badge, the collapsed reveal, the default filter |
| `on-behalf` | `/bets?for=<userId>` — asserts the request goes to the admin route with the **member's** id, and lands on their slate, not the admin's |
| `results-and-reveal` | A wager hidden while its bet is open, revealed once an admin closes it by upload; then the four-upload lifecycle to final payouts |

Notes worth knowing before you touch it:

- **Login is real.** Specs sign in with an actual magic link through the actual
  `/auth/callback` (`scripts/magic-link.ts`, shared with `dev-magiclink.ts`). There is no
  test-only auth bypass in the app and there shouldn't be one — anything that weakened login to
  make testing easier would be testing a different app than the one that ships.
- **Chromium is pinned, never downloaded.** `@playwright/test` is held at 1.56.x because that's
  the release whose Chromium revision matches the pre-installed build. Set
  `PLAYWRIGHT_CHROMIUM_PATH` if yours lives elsewhere; if the pinned path doesn't exist,
  Playwright falls back to its own resolution.
- **It refuses to run against anything but the local stack** — both a check on
  `NEXT_PUBLIC_SUPABASE_URL` and a guard on a stray `.env.local`. These specs create accounts and
  place wagers.
- **Assert rendered DOM, not HTTP 200.** #105 shipped as a complete no-op behind eleven passing
  unit tests and a green build. A journey that only checks pages load would have missed it.

## The full-pool simulation (~32 members)

See the pool at scale without recruiting 32 people.

```bash
npm run test:sim            # from an empty database, ~40s, no Docker
```

Or load it into a stack you're already clicking around in — it needs the **19-bet** menu, since
the 13-bet Phase 1 seed has no Phase 2 to bet into:

```bash
# 1. import docs/import/bets-sample.xlsx at /admin/import (or run import-roundtrip.ts)
# 2. then:
psql "$PGURI" -f supabase/seed-sim-pool.sql
```

It leaves you mid-tournament: **Phase 1 closed** with every pick settled (so the reveal is
populated and theoretical payouts are real) and **Phase 2 open** with a live deadline. Roughly
32 members, ~256 wagers, all rule-valid by construction — one pick per bet, and nobody bets on
a bet they're a linked player in, so the self-bet cap and opponent block can't fire.

Teardown: `psql "$PGURI" -f supabase/seed-sim-pool-teardown.sql`. The accounts are
`@sim.ozark.test` — a third domain, deliberately neither `@ozark.test` nor
`@dryrun.ozark.test`, so no teardown can reach another fixture's accounts.

## Reset / teardown

- **Remove the simulated pool:** `psql "$PGURI" -f supabase/seed-sim-pool-teardown.sql`.
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
- **The seeded menu is closed — load `supabase/seed-e2e.sql` if you want to place.** See the
  warning in step 3. Placement needs `bets.status = 'open'` AND the phase deadline still ahead
  (`wagering_open`, Sprint 25); the tournament's own `status` is not the gate, though setting it
  to `active` is what lights the dashboard's **Betting Open** badge.
- **Never point this seed at production.** It writes real accounts into `auth.users`.
- **Local host: use `localhost:3000`.** Both are in the allow-list, but the magic-link callback
  normalises its redirect to `localhost`, so starting on `127.0.0.1` loses the session cookie
  mid-login. See the note under the `dev-magiclink.ts` recipe.
