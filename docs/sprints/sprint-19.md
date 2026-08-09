# Sprint 19 — Automated Testing & Pre-Prime-Time Pool Simulation

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open. **Testing/hardening sprint** — it ships no user-facing feature, but it de-risks Sprint 9's group dry run and closes the pile of "in-browser verify pending" issues (#24/#26/#31/#35) by turning "a human clicks through it" into "a command clicks through it." Best done alongside or just before Sprint 9.

**Goal:** one command drives a fresh checkout through the whole member journey — sign up → onboard → get approved → place/edit/remove a bet → see it reveal at close → see payouts — with no human clicking and no real email, and the database guarantees (RLS, import idempotency, payout math) run in CI on every PR. So that when ~32 real people show up, the paths they'll walk have already been walked automatically.

**Target:** as time allows before the Aug 28 feature freeze; ideally before the Sprint 9 dry run so the dry run surfaces *content* bugs, not *plumbing* bugs · **Blockers:** none hard — the app is code-complete through Sprint 8; this only adds test scaffolding around it.

**Reads:** `docs/DEV_TESTING.md` (the seeded dummy accounts + magic-link-without-email trick this builds on), `scripts/local-db-verify.sh` and the four `scripts/*-roundtrip.ts` harnesses (the DB half to wire into CI), `.github/workflows/ci.yml` (the current four-check gate to extend), `supabase/seed-dev-accounts.sql` + `supabase/seed-sample-phase1.sql` (the fixtures to generalize), `docs/PRD.md` §7/§8 (the enforced rules and the four-upload lifecycle the E2E path mirrors), `docs/sprints/sprint-9.md` (the dry run this feeds).

### Why this sprint (the gap it closes)

The unit + round-trip + CI stack already proves the *pure logic* and the *DB layer* in isolation. What nothing exercises automatically is the **assembled app over a browser** and the **whole pari-mutuel lifecycle at pool scale**. Today that verification is manual (`DEV_TESTING.md` is a click-through cheat sheet) and human-recruited (Sprint 9 says "recruit 5+ real participants"). This sprint automates both, and keeps scope tight — a handful of happy-path journeys and one synthetic pool, **not** exhaustive coverage or load testing (32 users doesn't warrant it; see Out of Scope).

- [x] **Playwright harness.** Add `@playwright/test` (devDep) + `playwright.config.ts` wired to the **pre-installed** Chromium — `executablePath: '/opt/pw-browsers/chromium'`, no `playwright install` (this env sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`). `test:e2e` script boots `next dev` (or `next start` on a prod build) against the **local Supabase stack** (Option B in `DEV_TESTING.md`). Gitignore `test-results/`, `playwright-report/`. Keep it one browser (Chromium), one project — no cross-browser matrix.
- [x] **E2E magic-link sign-in helper.** A fixture that logs a test in **without email** by minting an action link with the service-role key (the `scripts/dev-magiclink.ts` `admin.generateLink` path) and navigating to it — so specs start already-authed as a chosen seeded account. Service-role key comes from the local stack's env, never committed.
- [x] **E2E critical journeys** (each drives a seeded `@ozark.test` account against the `seed-sample-phase1.sql` menu):
  - New member: `newbie@` → forced `/onboarding` → sets display name → walkthrough → lands on `/bets` **view-only** (can't place).
  - Admin approval: `admin@` → `/admin/people` → the newly-onboarded account at *Awaiting approval* → **Approve** → set fee + player flag → *Approve to bet*.
  - Place / edit / remove: the just-approved account places a valid wager on `/bets`, edits it, removes it; `/my-bets` reflects each step; a §7-violating slip is rejected with the server error surfaced.
  - Reveal-at-close: others' picks on an **open** bet stay hidden, become visible once the bet is `closed` (drives the closed-bet + `deleted_at` visibility contract end-to-end, not just in the RLS round-trip).
  - Payouts render: after results upload, `/results` and the My Bets per-pick payout rollup show numbers (asserted against the same worked example `lib/payouts.test.ts` already pins).
- [x] **DB round-trips in CI.** Add a job to `ci.yml` using a `postgres:16` **service container** that runs the `local-db-verify.sh` sequence (stub auth/storage schema → migrations → seeds → the four round-trips → `phase-compliance.sql` smoke). This gates RLS/import/payout regressions per-PR instead of only when someone runs the script locally. (E2E stays a separate, optional job or local-only if a full Supabase-in-CI stack proves fiddly — don't block the merge gate on browser flakiness.)
- [x] **Full-pool synthetic fixture.** A `supabase/seed-sim-pool.sql` (or a small generator script) that stands up **~32 members** with realistic, rule-valid placements spread across phases and categories — parameterized off the `tournaments` row like everything else, with a teardown snippet (matches the `%@ozark.test` convention). One person can then load it and see the pool at scale: pari-mutuel split across a real field, leaderboard populated, reveal-at-close with many bettors. This is the "simulate everyone signed up" fixture Sprint 9 otherwise needs live humans for.
- [x] **Optional stretch — met, but mostly by things that already existed.** `scripts/dry-run-verify.ts` has rehearsed the exact four-upload lifecycle with the numbers checked since Sprint 21, so there was nothing to extend. What this sprint added on top: `scripts/sim-pool-verify.ts` makes the same pool assertion at **32-person scale** (Σ actual == void-adjusted pool, to the cent), and `e2e/results-and-reveal.spec.ts` drives the upload lifecycle **through the browser** rather than through SQL. Original wording: extend the round-trip harness into a **whole-lifecycle assertion** — upload Phase 1 → N synthetic users place → close via re-upload → upload results → open Phase 2 → final payouts — asserting the void-adjusted pool total sums back to entry fees. A scripted rehearsal of the exact four-upload dry run, numbers checked.
- [x] **Docs:** update `docs/DEV_TESTING.md` (how to run E2E + load the sim pool), the README **Tests & verification** list, this file, and `ROADMAP.md` (index + status). File any browser-verify issue the E2E suite now covers as closed/superseded.

**Done when:** `npm run test:e2e` drives a fresh local stack through sign-up → onboarding → approval → place/edit/remove → reveal-at-close → payouts without a human touching the browser, **and** a green CI run shows the DB round-trips executing against a Postgres service, **and** loading `seed-sim-pool.sql` renders a full ~32-person pool (leaderboard + payouts) locally. When that holds, Sprint 9's dry run is a content check, not a plumbing check.

### Out of scope (don't build)

- **Load / concurrency / stress testing.** ~32 users placing near a deadline is trivial traffic; Supabase + Vercel handle it without tuning. No k6, no soak tests.
- **Exhaustive E2E coverage / cross-browser matrix / visual regression.** A handful of Chromium happy-paths for the money-critical journeys, not every page and edge. Pure-logic edges stay in the fast `lib/*.test.ts` unit layer, where they belong.
- **A CI Supabase stack as a hard merge gate.** If full auth-in-CI is flaky, keep E2E local/optional; the unit + typecheck + build + DB-round-trip gate is the required floor.
- **Testing prod.** Everything here runs against the **local stack or a throwaway project** — never seed synthetic accounts into production (same rule as `DEV_TESTING.md`).

---

## What shipped (Aug 9, 2026)

**One command, no human:** `npm run test:e2e` — 13 specs, 7 journeys, ~1 min once the
stack is warm. `scripts/e2e-verify.sh` starts the local Supabase stack, loads the seeds and
runs Playwright against the pre-installed Chromium. `npm run test:sim` stands up the
~32-person pool from an empty database in ~40s with no Docker at all.

**It found a production bug on its first real run.** Sprint 23's `placed_by_user_id` gave
`bet_placements` a second foreign key to `users`, which made the unqualified `users ( … )`
embed ambiguous. PostgREST rejected the whole request with `PGRST201`, neither call site
checked the error, and the null result flowed into the ordinary "nobody bet on this"
rendering path. **Every closed bet on `/bets` had been reading "No wagers on this bet" since
Sprint 23, and `/admin/view` showed nothing.** The weekend's social moment, silently gone.
Unit tests couldn't see it (they're downstream of the query) and neither could the DB
round-trips (they speak SQL, never PostgREST). It took a browser. Fixed in `3da30b9`.

**Three pieces of local-stack setup the docs had wrong**, each of which made the app look
broken when it wasn't:
- `config.toml`'s magic-link `content_path` was resolved from the wrong root, so
  `supabase start` refused the config outright.
- Hosted Supabase grants `anon`/`authenticated`/`service_role` their table privileges via
  `ALTER DEFAULT PRIVILEGES`; the local image doesn't, so every page rendered
  "No bets published yet". `e2e-verify.sh` now grants them, the same way
  `local-db-verify.sh` teaches a bare Postgres to behave like Supabase.
- `DEV_TESTING.md` recommended `127.0.0.1:3000`. The callback normalises its redirect to
  `localhost`, so that origin loses the session cookie mid-login and reads as an expired link.

**Two documentation drifts corrected** (docs beat code — flagged, not silently aligned):
`seed-sample-phase1.sql` was described as "an open bet menu to place on" and never was (all 13
bets are `closed`); and `/my-bets` is read-only, so "reflects each step" means reading it after
each write on `/bets`, not editing there.

**Deviation from the plan, deliberate:** the DB job runs `local-db-verify.sh` verbatim on the
runner's built-in PostgreSQL 16 rather than against a `postgres:16` service container. The
script creates its own throwaway cluster; pointing it at a service would mean rewriting it to
accept an external `PGURI`. This way CI runs byte-for-byte what a developer runs.

**Left for a human.** The suite is Chromium at desktop viewport, so it says nothing about how
anything *looks* or how it behaves under a real thumb. #127's phone half, and any visual check,
still need a person.
