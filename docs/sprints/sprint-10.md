# Sprint 10 — Admin Roster & Registration Status (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting; if it never ships, the tournament still runs.

**Goal:** one read-only admin page that answers "who's in, who's stuck, and who's missing" at a glance — replacing the Sprint 5 chase SQL run by hand in Studio.
**Target:** as time allows before the Aug 28 feature freeze — most useful if it lands before betting opens · **Blockers:** none hard. Needs the same server-side admin trust boundary as `/admin/import` (service-role client) to read auth data.

**Reads:** `DATA_MODEL.md` §3.1/§3.3 (`users`, `tournament_participants`), `ARCHITECTURE.md` (auth flow, admin gating).

**The wrinkle:** today `tournament_participants.user_id` requires a registered `users` row, so "in the tournament but never registered" is unrepresentable — a small schema addition comes first.

- [ ] Migration: make `tournament_participants.user_id` nullable and add `invited_email text` (unique per tournament), so admins can enter the expected roster in Studio before anyone signs in. Link the row to the `users` row by email match when the person registers (extend the new-user trigger, or match at page load — pick the simpler).
- [ ] `/admin/roster` (admin-gated, read-only — same pattern as `/admin/view`): one table of everyone expected in the tournament. Columns: name/email · role (admin badge) · last login · status.
- [ ] Status is derived, one per person: **not registered** (invite row, no matching auth user) · **registered, not ready** (has authenticated, but no linked participant row — email mismatch or not on the roster — or entry fee unset) · **ready to bet** (linked participant row with entry fee). Admin is a badge, not a status.
- [ ] Attention strip above the table: counts + names for the two chase lists — "hasn't registered yet" and "registered but not set up to bet" — since those are the lists an admin actually acts on (nag texts, Studio fix-ups).
- [ ] Last login from `auth.users.last_sign_in_at` via the server-side service-role client (the auth schema isn't client-readable); render relative ("3 days ago") with the absolute timestamp on hover. "Never" for invite-only rows.

**Done when:** an admin can read off `/admin/roster`, without touching Studio or SQL: who still needs to register, who registered but can't bet yet, who's ready, who's an admin, and when each person last logged in.
