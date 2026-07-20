# Sprint 16 — First-Run Onboarding, Self-Set Identity & Admin Bettor-Approval (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting. Grew out of `docs/COMPETITIVE_ANALYSIS.md` §1.2 / §6 (first-run onboarding / "How it works"), expanded on Andrew's direction (Jul 20, 2026) to also cover self-set identity and an in-app bettor-approval step.

**Goal:** turn "registration" from an invisible Studio chore into a real product flow. A first-time member is required to set their own **display name** (optional nickname + photo) before entering the app, reads a dismissible **"how this pool works"** walkthrough, and can immediately **browse the bet menu** — but can only **place bets once an admin approves them** from a new `/admin/participants` page. Approving a member is what creates their `tournament_participants` row (entry fee + player flag), replacing the manual Studio add.

**Target:** as time allows before the Aug 28 feature freeze · **Blockers:** none hard. Builds on Sprint 1 (participants schema), Sprint 4 (placements), Sprint 15 (profile/avatar plumbing).

**Reads:** `docs/COMPETITIVE_ANALYSIS.md` §1.2 / §6 (the stub), `docs/PRD.md` §7 (bet rules — the walkthrough must state exactly the enforced ones) and §12 (A11/A12 identity decisions), `docs/DATA_MODEL.md` §3.1 (`users`) / §3.3 (`tournament_participants`), `docs/ARCHITECTURE.md` §3 (auth/onboarding flow), ADR 0001 §11 (why `display_name` matters to import).

### Two decisions this sprint acts on (Andrew, Jul 20, 2026 — see PRD §12 A12)
- **Self-set display name, admin-verified.** A member sets their own `display_name` **once** at onboarding — this reopens A11's "admin-set only" in a controlled way. The DB guard permits the self-set only while `onboarded_at IS NULL`; afterward the name is admin-owned again. The **admin verifies/corrects it at approval**, before enabling betting, so the importer's name-matching (ADR 0001 §11) is never fed an unverified name.
- **Approval creates the row.** Betting eligibility stays "a `tournament_participants` row exists" (PRD §12 A11 model) — no `betting_enabled` column. The deferred per-user betting toggle (`OUTSTANDING_DECISIONS.md` §1) is **superseded** by this: approving on `/admin/participants` is the automated create.

**Onboarding state lives on `users.onboarded_at`** (NULL = first-run step not done). The middleware forces `/onboarding` while it's NULL; existing members are backfilled as already-onboarded so they're never yanked into the flow.

- [x] Migration: add `users.onboarded_at`; backfill existing rows as onboarded; relax `guard_users_self_update` to allow a one-time self-set of `display_name` + `onboarded_at` while `onboarded_at IS NULL` (pinned afterward; `id`/`email`/`is_admin`/`created_at` always pinned).
- [x] `lib/profile.ts`: `validateDisplayName` (required, length-bounded), `normalizeDisplayName`, `parseOnboardingBody`, `validateOnboarding` — pure, node:test-covered.
- [x] `/onboarding` (auth-gated, in the middleware matcher): required display-name step (+ optional nickname/photo, reusing the Sprint 15 avatar-upload path) → dismissible walkthrough → lands on `/bets`. `POST /api/onboarding` writes the fields + stamps `onboarded_at`.
- [x] `components/onboarding/how-it-works.tsx`: 4-card walkthrough (pari-mutuel pot, phases + picks-per-phase, exact-entry total, reveal-at-close) with the pick-count range read from the `tournaments` row; re-openable via a dashboard launcher.
- [x] Middleware: redirect authenticated-but-not-onboarded members to `/onboarding`; send onboarded members away from `/login` + `/onboarding`.
- [x] `/admin/participants` (admin-guarded, 404 for non-admins): **Awaiting approval** (onboarded, no participant row) and **In the pool** lists. Approve = verify display name + set entry fee + player flag → create the row. Edit/revoke existing participants. `POST/PATCH/DELETE /api/admin/participants` re-checks `is_admin` and validates the fee with `validateEntryFee`. Linked from the `/profile` admin card.
- [x] Reframe non-participant copy as "pending approval" (not "not registered") on `/dashboard`, `/bets`, `/my-bets`, `/profile`.
- [ ] Docs: this file; PRD §12 A12; DATA_MODEL §3.1/§3.3; ARCHITECTURE §3; ROADMAP index + status; OUTSTANDING_DECISIONS §1; COMPETITIVE_ANALYSIS §1.2/§6; README Track 2.

**Done when:** a first-time member is forced through onboarding (self-set display name), reads and can re-open the walkthrough, and sees the bet menu but can't place; an admin approves them from `/admin/participants` (which verifies the name and creates the participant row); and the newly approved member places a valid wager — with no Supabase Studio step involved. A self-serve `/profile` update still can never change `display_name` (guard) once onboarded.
