# Sprint 14 — Announcement Banner (Bonus)

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Bonus wish-list sprint (added Jul 18, 2026)** — an enhancement, never an MVP blocker. Work it only when no MVP sprint (0–9) is waiting.

**Goal:** a site-wide announcement banner at the top of every logged-in page. Admins turn it on/off and set the text; users can dismiss it with an ×, but it comes back on their next login.
**Target:** as time allows before the Aug 28 feature freeze — genuinely handy during tournament week ("Phase 2 is open", "results are up") · **Blockers:** none.

**Reads:** `DATA_MODEL.md` §3.2 (`tournaments` row), `app/layout.tsx` (where the shared chrome lives), the `ozark-open-design` skill (banner styling — prominent but on-brand).

**Keep the no-admin-UI rule intact:** on/off and the text are edited on the `tournaments` row in Studio — no toggle page. RLS already fits (authenticated read, admin write).

- [ ] Migration: add `announcement text` and `announcement_active boolean NOT NULL DEFAULT false` to `tournaments`. Toggling off preserves the text for reuse.
- [ ] Banner component in the shared authenticated layout, above everything: renders when `announcement_active` and the text is non-empty. Logged-in pages only — anon can't read `tournaments` under RLS, and announcements are for participants anyway.
- [ ] Dismissible via ×. Store the dismissal in `sessionStorage` keyed by a hash of the announcement text, so: it returns on the next browser session (≈ every login — magic-link logins start fresh sessions), and a *changed* announcement reappears immediately even for users who dismissed the old one.
- [ ] Style per the design skill: full-width strip at the very top, distinct from page content, readable on mobile, no layout jump on dismiss beyond the strip collapsing.
- [ ] Document the two-column Studio edit in `README.md`'s admin workflow (set text → flip `announcement_active`).

**Done when:** an admin flips the row in Studio and every logged-in user sees the banner on every page; closing it hides it for that session; a fresh login (or a changed announcement) brings it back.
