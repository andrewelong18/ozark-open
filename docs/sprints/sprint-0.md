# Sprint 0 — Deploy & Verify Foundations

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open.

**Goal:** everything already coded is provably working in production.
**Target:** week of Jul 13 · **Blockers:** none — do this first.

- [x] Confirm the Vercel project exists, is connected to the repo, and auto-deploys `main`; create it if not. — **created fresh** under `nerdyandyproject`, Jul 16, 2026.
- [x] Confirm the production Supabase project exists and **is not paused** (free tier pauses after ~1 week idle); apply all three migrations (`npx supabase db push` or SQL editor). — new project `rbjqqzjqhsbcotqfrwhb`; all three migrations applied via SQL editor; 2026 tournament + 7 categories seeded.
- [x] Set env vars in Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). — see the env-var gotcha below.
- [ ] **Configure custom SMTP (Resend free tier) for Supabase Auth emails.** The built-in email service is dev-only and rate-limited to a few messages/hour — it will drop magic links on tournament morning. — **deferred**; built-in email is sufficient for solo dev, required before the group dry run.
- [ ] Extend session/JWT duration in Supabase Auth settings so a login during dry-run week survives through Sept 27.
- [ ] Decide: upgrade to Supabase Pro ($25) for September (backups + no pausing), or accept manual mitigation.
- [x] ~~Ask Steve to enable Issues on `riversteve/ozark-open`~~ — **moot:** issue-filing retargeted to `andrewelong18/ozark-open` (own fork) on Jul 16, 2026.
- [x] Log in via magic link on a phone (real-world email deliverability check through Resend). — verified Jul 16, 2026 on the production URL via Supabase's **built-in** email; the Resend deliverability check still stands (see deferred item above).
- [ ] Promote Andrew, Pat, Jake, Steve to `is_admin = true` in Studio. — Pat/Jake/Steve must log in once before their rows exist.
- [ ] Fix the four admins' `display_name` values in Studio (they default to email addresses) — admin-set per PRD §12 Q13. **Also enter proper display names for the players named in the sample sheet** — Sprint 1's seed and Sprint 2's name-matching key off `users.display_name`.
- [ ] Confirm `/bets` and `/dashboard` render on prod (empty menu is fine — the bet schema gets reworked in Sprint 1; don't seed old-shape sample bets). — `/dashboard` confirmed Jul 16, 2026; `/bets` not yet clicked through while logged in.
- [x] ~~Send PRD §12 questions to Pat and Jake~~ — **answered by Jake, July 9, 2026**; decisions logged in PRD §12.

**Done when:** any admin can log in on their phone at the production URL and see the dashboard.
→ **Met Jul 16, 2026.** Remaining unchecked items are hardening (Resend, JWT, Pro) and admin data entry; the display-name item **blocks Sprint 1's seed**.

---

## Infrastructure facts (Jul 16, 2026 rebuild)

Ownership was taken back from the fork; all infra is now under Andrew's own accounts.

- **Production URL: https://ozark-open-sportsbook.vercel.app** — Vercel project `nerdyandyproject/ozark-open-sportsbook`, auto-deploys `main`.
- **Custom domain: `ozark-open.com`** — owned, registered through Vercel, so **Vercel manages its DNS** (add records under the domain's DNS tab, not an external registrar). It's the public-facing domain and the auth email sending domain. Assign it to the project in Vercel → Settings → Domains to make it the primary app URL; the `.vercel.app` URL keeps working either way.
- **`ozark-open.vercel.app` is NOT ours** — it's the fork's stale deployment and still serves a broken build. Ignore it; never use it for testing or in Supabase config.
- **Supabase project:** `rbjqqzjqhsbcotqfrwhb` · auth uses the new-style **publishable** key (`sb_publishable_…`, the `anon` replacement).
- **Supabase Auth URL config** must list `https://ozark-open.com/**` **and** `https://ozark-open-sportsbook.vercel.app/**` (keep both during the cutover) plus `http://localhost:3000/**` for local dev. The app derives `emailRedirectTo` from the **request host**, so whichever domain a user visits must be in this list or their magic link breaks.
- **Auth emails go through Resend SMTP** (issue #16) — Supabase's built-in email is dev-only (a few/hour) and drops links when ~32 people log in at once. Config: Supabase → Authentication → Emails → SMTP → host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key, sender `noreply@ozark-open.com`. The `ozark-open.com` sending domain is verified in Resend by pasting its DKIM/SPF/MX records into Vercel DNS.
- **Env-var gotcha (cost hours):** the Vercel dashboard silently saved `NEXT_PUBLIC_*` vars with **empty values**, and `NEXT_PUBLIC_*` is inlined at **build** time — so every build baked in blanks and login failed with "fetch failed". Set them via CLI and verify:
  ```
  vercel env add NEXT_PUBLIC_SUPABASE_URL production --value '<url>' --no-sensitive --force
  vercel env pull .env.check --environment=production   # confirm non-empty
  ```
  Keep `NEXT_PUBLIC_*` vars **non-sensitive** — they're public by design, and sensitive ones can't be read back to verify.
