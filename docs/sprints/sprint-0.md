# Sprint 0 — Deploy & Verify Foundations

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** everything already coded is provably working in production.
**Target:** week of Jul 13 · **Blockers:** none — do this first.

- [x] Confirm the Vercel project exists, is connected to the repo, and auto-deploys `main`; create it if not. — **created fresh** under `nerdyandyproject`, Jul 16, 2026.
- [x] Confirm the production Supabase project exists and **is not paused** (free tier pauses after ~1 week idle); apply all three migrations (`npx supabase db push` or SQL editor). — new project `rbjqqzjqhsbcotqfrwhb`; all three migrations applied via SQL editor; 2026 tournament + 7 categories seeded.
- [x] Set env vars in Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). — see the env-var gotcha below.
- [x] **Configure custom SMTP (Resend free tier) for Supabase Auth emails.** The built-in email service is dev-only and rate-limited to a few messages/hour — it will drop magic links on tournament morning. *(Done Jul 20, 2026 — [#16](https://github.com/andrewelong18/ozark-open/issues/16), closed.)*
- [x] Extend session/JWT duration in Supabase Auth settings so a login during dry-run week survives through Sept 27. *(Done — [#17](https://github.com/andrewelong18/ozark-open/issues/17), closed.)*
- [ ] Decide: upgrade to Supabase Pro ($25) for September (backups + no pausing), or accept manual mitigation. *(Still open — [#18](https://github.com/andrewelong18/ozark-open/issues/18). A real decision, not a chore. Sprint 9's [`scripts/db-export.sh`](../../scripts/db-export.sh) and Sprint 11's snapshots are the manual-mitigation half being built out regardless.)*
- [x] ~~Ask Steve to enable Issues on `riversteve/ozark-open`~~ — **moot:** issue-filing retargeted to `andrewelong18/ozark-open` (own fork) on Jul 16, 2026.
- [x] Log in via magic link on a phone (real-world email deliverability check through Resend). — verified Jul 16, 2026 on the production URL via Supabase's **built-in** email; the Resend deliverability check still stands (see deferred item above).
- [x] Promote Andrew, Pat, Jake, Steve to `is_admin = true` in Studio. — Pat/Jake/Steve must log in once before their rows exist. *(Done — [#15](https://github.com/andrewelong18/ozark-open/issues/15), closed. **Jake is still outstanding** and carried forward as [#60](https://github.com/andrewelong18/ozark-open/issues/60): he has to log in once before there's a row to flip.)*
- [x] Fix the four admins' `display_name` values in Studio (they default to email addresses) — admin-set per PRD §12 Q13. **Also enter proper display names for the players named in the sample sheet** — Sprint 1's seed and Sprint 2's name-matching key off `users.display_name`. *(Done — [#6](https://github.com/andrewelong18/ozark-open/issues/6) / [#11](https://github.com/andrewelong18/ozark-open/issues/11), both closed; Sprint 1's seed linked 13 bets / 57 picks off the result. Since Sprint 23 an admin can also do this from `/admin/people` instead of Studio.)*
- [x] Confirm `/bets` and `/dashboard` render on prod (empty menu is fine — the bet schema gets reworked in Sprint 1; don't seed old-shape sample bets). *(`/dashboard` confirmed Jul 16, 2026; `/bets` closed Jul 18 as a duplicate of the Sprint 1 verification — [#8](https://github.com/andrewelong18/ozark-open/issues/8), [#13](https://github.com/andrewelong18/ozark-open/issues/13).)*
- [x] ~~Send PRD §12 questions to Pat and Jake~~ — **answered by Jake, July 9, 2026**; decisions logged in PRD §12.

**Done when:** any admin can log in on their phone at the production URL and see the dashboard.
→ **Met Jul 16, 2026.** The hardening and data-entry items were closed out over the following
week (Resend #16, JWT #17, admins #15, display names #6/#11); ticked here Aug 9, 2026 during a
roadmap audit that found them still reading as open. **One item is genuinely still open:** the
Supabase Pro decision ([#18](https://github.com/andrewelong18/ozark-open/issues/18)), plus
Jake's admin flag ([#60](https://github.com/andrewelong18/ozark-open/issues/60)), which waits
on him logging in once.

---

## Infrastructure facts (Jul 16, 2026 rebuild)

Ownership was taken back from the fork; all infra is now under Andrew's own accounts.

- **Production URL: https://ozark-open.com** — Vercel project `nerdyandyproject/ozark-open-sportsbook`, auto-deploys `main`. The `.vercel.app` aliases still resolve, but since Aug 23, 2026 the middleware 308s every one of them to the canonical domain.
- **Custom domain: `ozark-open.com`** — owned, registered through Vercel, so **Vercel manages its DNS** (add records under the domain's DNS tab, not an external registrar). It's the public-facing domain and the auth email sending domain. Assign it to the project in Vercel → Settings → Domains to make it the primary app URL; the `.vercel.app` URL keeps working either way.
- **`ozark-open.vercel.app` is NOT ours** — it's the fork's stale deployment and still serves a broken build. Ignore it; never use it for testing or in Supabase config.
- **Supabase project:** `rbjqqzjqhsbcotqfrwhb` · auth uses the new-style **publishable** key (`sb_publishable_…`, the `anon` replacement).
- **Supabase Auth URL config** — `site_url` **must be `https://ozark-open.com`**: the email template builds its link from it, so it, not the request host, decides where a member lands. The allow-list lists `https://ozark-open.com/**` plus `https://www.ozark-open.com/**`, `https://ozark-open-sportsbook.vercel.app/**` (old links in flight) and `http://localhost:3000/**` for local dev. Outside production the app still derives `emailRedirectTo` from the request host, so a preview's host must be in this list or its magic link breaks. `bash scripts/auth-url-check.sh` asserts the pair; `lib/site-url.ts` is the app-side half.
- **Auth emails go through Resend SMTP** (issue #16) — Supabase's built-in email is dev-only (a few/hour) and drops links when ~32 people log in at once. Config: Supabase → Authentication → Emails → SMTP → host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key, sender `noreply@ozark-open.com`. The `ozark-open.com` sending domain is verified in Resend by pasting its DKIM/SPF/MX records into Vercel DNS.
- **Env-var gotcha (cost hours):** the Vercel dashboard silently saved `NEXT_PUBLIC_*` vars with **empty values**, and `NEXT_PUBLIC_*` is inlined at **build** time — so every build baked in blanks and login failed with "fetch failed". Set them via CLI and verify:
  ```
  vercel env add NEXT_PUBLIC_SUPABASE_URL production --value '<url>' --no-sensitive --force
  vercel env pull .env.check --environment=production   # confirm non-empty
  ```
  Keep `NEXT_PUBLIC_*` vars **non-sensitive** — they're public by design, and sensitive ones can't be read back to verify.
