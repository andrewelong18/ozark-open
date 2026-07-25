# Sprint 10 — Admin Roster & Registration Status (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting; if it never ships, the tournament still runs.

**Goal:** one read-only admin page that answers "who's in, who's stuck, and who's missing" at a glance — replacing the Sprint 5 chase SQL run by hand in Studio.
**Target:** as time allows before the Aug 28 feature freeze — most useful if it lands before betting opens · **Blockers:** none hard. Needs the same server-side admin trust boundary as `/admin/import`; auth data comes from a `SECURITY DEFINER` RPC gated on `is_admin()`, not a service-role client.

**Reads:** `DATA_MODEL.md` §3.1/§3.3 (`users`, `tournament_participants`), `ARCHITECTURE.md` (auth flow, admin gating).

**The wrinkle:** `tournament_participants` can't represent "expected in the tournament but never registered" — and shouldn't. A row there *means* approved to bet (PRD §12 A11), and it's what `/dashboard`, `/results` and `/admin/view` sum the pool from, so invite rows in that table would either inflate the pool or force a `user_id IS NOT NULL` guard into every tournament-wide query. Hence a small separate table.

- [x] Migration: new `tournament_invites` table (`tournament_id`, `email`, optional `invited_name`), unique per tournament on `lower(email)`, admin-only RLS — so admins can enter the expected roster in Studio before anyone signs in. Linking to the `users` row happens by normalized email at page load, so the new-user trigger is untouched (the sprint allowed either; this is the simpler). — `20260725000000_tournament_invites.sql`
- [x] `/admin/roster` (admin-gated, read-only — same pattern as `/admin/view`): one table of everyone expected in the tournament. Columns: name/email · role (admin badge) · last login · status.
- [x] Status is derived, one per person: **not registered** (invite row, no matching auth user) · **registered, not ready** (has authenticated, but no linked participant row — email mismatch or not on the roster — or entry fee unset) · **ready to bet** (linked participant row with entry fee). Admin is a badge, not a status. — `lib/roster.ts`, with the sub-reason (`no_account` / `not_onboarded` / `not_approved` / `fee_unset`) driving the badge label
- [x] Attention strip above the table: counts + names for the two chase lists — "hasn't registered yet" and "registered but not set up to bet" — since those are the lists an admin actually acts on (nag texts, Studio fix-ups).
- [x] Last login from `auth.users.last_sign_in_at` via `public.admin_auth_activity()`, a `SECURITY DEFINER` RPC gated on `is_admin()` (the auth schema isn't client-readable); render relative ("3 days ago") with the absolute timestamp on hover. "Never" for invite-only rows. — `lib/format.ts`
- [x] Docs: this file; `DATA_MODEL.md` §2/§3.3/§3.8/§5/§6; `ROADMAP.md` index + status summary; `README.md` Track 2; `CLAUDE.md`.

**Done when:** an admin can read off `/admin/roster`, without touching Studio or SQL: who still needs to register, who registered but can't bet yet, who's ready, who's an admin, and when each person last logged in.

**Shipped Jul 25, 2026.** Prod migration applied and verified the same day (RLS on with one admin-only policy; the `lower(email)` unique index rejects a case-variant duplicate; `admin_auth_activity()` returns every auth user to an admin session and zero rows to a non-admin, with `EXECUTE` revoked from `anon`). Browser walkthrough still pending — see the ROADMAP row.
