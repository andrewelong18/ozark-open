# Sprint 15 — Self-Serve Profile Page (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026; cut into a file Jul 19, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting. Born from `docs/COMPETITIVE_ANALYSIS.md` §1.1 / §6 (self-serve profile/account page).

**Goal:** a `/profile` page where a participant sets their own **nickname** and **profile picture**, reads their own **status** (admin or not, entry fee, registration / ready-to-bet), and — if they're an admin — reaches the admin tools. Wherever a name renders across the app, the nickname shows right next to it (a touch smaller/lighter, never a muted subtext); no nickname → just the name. Members with no photo get a branded initials placeholder.
**Target:** as time allows before the Aug 28 feature freeze · **Blockers:** none — Andrew's nickname direction (Jul 19) resolves the `OUTSTANDING_DECISIONS.md` §1 display-name blocker by adding a *separate cosmetic* field, so `display_name` stays admin-controlled and import name-matching (ADR 0001 §11) is untouched.

**Reads:** `docs/COMPETITIVE_ANALYSIS.md` §1.1 / §6 (the stub), `docs/DATA_MODEL.md` §3.1 (`users`), `docs/ARCHITECTURE.md` (auth flow), ADR 0001 §11 (why `display_name` stays admin-set), the `ozark-open-design` skill (avatar + profile styling).

**`display_name` stays admin-controlled; the nickname is cosmetic.** Users edit only `nickname` + `avatar_url` — never `display_name` (it feeds the importer's name-matching) or `is_admin`. A DB guard trigger pins those columns for any self-serve update; only Studio / an admin session can change them. No new admin CMS: `/profile` is a *user* page that links to the existing `/admin/view` + `/admin/import`.

- [x] Migration: add `nickname` + `avatar_url` to `public.users`; add an own-row `UPDATE` RLS policy (`auth.uid() = id`) and a `BEFORE UPDATE` guard trigger that pins `display_name`/`is_admin`/`email`/`id`/`created_at` for logged-in non-admins.
- [x] Migration: public `avatars` storage bucket + `storage.objects` policies (public read; a user may write only under their own `<uid>/` prefix).
- [x] `/profile` (auth-gated, added to the middleware matcher): hero avatar + name, an edit form, a status section (role · registration · entry fee · ready-to-bet), a "how this pool works" primer, and an admin section for admins.
- [x] Edit flow: nickname `<input>` + avatar upload. The file goes browser → Storage under the user's own folder; `PATCH /api/profile` validates via a pure `lib/profile.ts` and writes `nickname` (+ a fresh public `avatar_url`) under the user's session (RLS + trigger are the real authorization).
- [x] Shared `<UserName>` (name + quoted nickname, slightly smaller/lighter) and `<Avatar>` (uploaded image or branded initials placeholder), threaded through `lib/payouts.ts` / `lib/closed-bets.ts` / `lib/admin-view.ts` and rendered in the header, `/results` (winner + leaderboard), `/bets` closed placements, `/admin/view`, and `/profile`.
- [x] Relocate the admin entry point: drop the top-nav "Admin" pill; admins reach admin tools from `/profile`. The header user cluster becomes an avatar + name linking to `/profile`.

**Done when:** a participant opens `/profile`, sets a nickname and uploads a photo without an admin touching Studio, and sees both reflected next to their name across the app (initials placeholder until they upload); they read their own admin/registration/ready-to-bet status; an admin finds the admin links there while the top-nav pill is gone; and a self-serve update can never change `display_name` or `is_admin` (guard trigger).
