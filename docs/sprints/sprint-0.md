# Sprint 0 — Deploy & Verify Foundations

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** everything already coded is provably working in production.
**Target:** week of Jul 13 · **Blockers:** none — do this first.

- [ ] Confirm the Vercel project exists, is connected to the repo, and auto-deploys `main`; create it if not.
- [ ] Confirm the production Supabase project exists and **is not paused** (free tier pauses after ~1 week idle); apply all three migrations (`npx supabase db push` or SQL editor).
- [ ] Set env vars in Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- [ ] **Configure custom SMTP (Resend free tier) for Supabase Auth emails.** The built-in email service is dev-only and rate-limited to a few messages/hour — it will drop magic links on tournament morning.
- [ ] Extend session/JWT duration in Supabase Auth settings so a login during dry-run week survives through Sept 27.
- [ ] Decide: upgrade to Supabase Pro ($25) for September (backups + no pausing), or accept manual mitigation.
- [ ] Ask Steve to enable Issues on `riversteve/ozark-open` (Settings → General → Features → Issues; disabled by default on forks) — the sprint workflow logs bugs and manual steps there.
- [ ] Log in via magic link on a phone (real-world email deliverability check through Resend).
- [ ] Promote Andrew, Pat, Jake, Steve to `is_admin = true` in Studio.
- [ ] Fix the four admins' `display_name` values in Studio (they default to email addresses) — admin-set per PRD §12 Q13. **Also enter proper display names for the players named in the sample sheet** — Sprint 1's seed and Sprint 2's name-matching key off `users.display_name`.
- [ ] Confirm `/bets` and `/dashboard` render on prod (empty menu is fine — the bet schema gets reworked in Sprint 1; don't seed old-shape sample bets).
- [x] ~~Send PRD §12 questions to Pat and Jake~~ — **answered by Jake, July 9, 2026**; decisions logged in PRD §12.

**Done when:** any admin can log in on their phone at the production URL and see the dashboard.
