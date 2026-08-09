# Sprint 23 — Admin control surface

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Scope-expanding sprint.** `CLAUDE.md` listed custom admin UI beyond import/people/view as out of scope until Jul 31, 2026; the dry run superseded that. The scope lines in `CLAUDE.md` and `ROADMAP.md` are already updated — this sprint builds what they now allow.

**Goal:** give Pat the controls he asked for, so running the tournament stops requiring database access.

**Target:** before the Aug 28 feature freeze · **Blockers:** none hard. The bet-on-behalf item is large enough to deserve its own spec pass before building.

**Reads:** `docs/sprints/sprint-20.md` (the `/admin/people` console this extends), `docs/DATA_MODEL.md` §3.3/§3.8, `lib/placements.ts` (`TOURNAMENT_RULE_COLUMNS`, `toTournamentRules`), `docs/adr/0001-bet-pick-architecture.md` §7.

### Why this sprint

Pat drove the whole dry run and hit three walls that all had the same shape: *the app can show him the problem but not let him fix it.* The fourth wall — no UI for the chase list or the final unlock — is [Sprint 25](sprint-25.md).

- [x] **Admins can edit a display name** ([#99](https://github.com/andrewelong18/ozark-open/issues/99)). Members self-set once at onboarding; after that it's admin-owned, but no admin UI exists, so a typo is permanent without Studio. ~~**The database already permits this** — `guard_users_self_update` exempts admins — so this is purely the missing form field on `/admin/people`.~~ **Wrong, and it cost this item its whole effect — corrected Aug 9, 2026 (#124).** The trigger does exempt admins, but there was **no admin `UPDATE` policy on `public.users`**, and RLS is evaluated *before* the trigger. The row never reached the exemption, so the form shipped as a silent no-op for everyone but the acting admin. Fixed in `20260814000000`; see the #124 section below. Note `display_name` is load-bearing: `lib/import.ts` links picks to people by matching it, so a wrong name silently disables the self-bet cap, the self-pick flag and the opponent block for that person. This is a rules fix, not a cosmetic one.
- [x] **House-rules editor** ([#100](https://github.com/andrewelong18/ozark-open/issues/100)). All eight parameters already live on the `tournaments` row and reach validation through `toTournamentRules()` — `CLAUDE.md`'s no-hardcoded-figures rule held, so this is a form over an existing row rather than a refactor. Two requirements beyond the form: **server-side validation of the values themselves** (a min above the max must be refused), and **show the derived limits as Pat types** — the per-entry-fee table (`$25 → $12` because the code floors, `$50 → $20` because the cap binds) is what he actually reasons about and it isn't legible from the raw parameters. Changing a rule must not retroactively invalidate placed wagers; say so in the UI.
- [x] **Add a member and place wagers on their behalf** ([#101](https://github.com/andrewelong18/ozark-open/issues/101)) — **the wager half. The account half is deferred to [#124](https://github.com/andrewelong18/ozark-open/issues/124)** (see below). The largest item from the session — **write its own spec before building.** Two separable halves: creating an account without an email round-trip, and placing wagers as that member.

  The second half has teeth, and none of these are negotiable: every §7 rule must evaluate against the **bettor**, not the acting admin (pass the member's `Bettor` into `lib/validation.ts`, or the self-bet cap and opponent block silently apply to the wrong person) · `bet_placements` must record **who actually placed the wager**, because every row is money and a September dispute has to be reconstructable · `requires_admin_review` still keys off the *member* being the pick's player · writing for another user necessarily bypasses the own-rows-only RLS policy, so do it in a server route behind an explicit admin gate, **never by loosening the policy** · `odds_at_placement` still snapshots at write time.

- [x] **Docs:** this file; `README.md`'s admin workflow section; `ROADMAP.md` index + status summary. The `CLAUDE.md` and `ROADMAP.md` scope lines were already updated on Jul 31 — check they still describe what actually shipped.

**Done when:** Pat can correct a display name and see that person's picks link on the next upload; change any house rule from the app, with bad values refused; and add a member and place a wager for them that is refused when it breaks a §7 rule *for that member*, with the placement recording who entered it.

### The on-behalf spec (written before the code — [ADR 0001 §13](../adr/0001-bet-pick-architecture.md))

The sprint asked for a spec pass on #101 first, and the reason is that its failure mode is silent: a wager that passes validation and is **wrong**. ADR 0001 §13 is that spec; this is the short version.

**Bettor and actor are separate, and only one is the subject of the rules.**

```
bettor = whose money it is  → every §7 rule, every limit, requires_admin_review
actor  = who typed it in    → placed_by_user_id, and nothing else
```

The three hazards and where each is answered:

| Hazard | Answer |
|---|---|
| `bet_placements` INSERT is "only as yourself" | A **separate admin-scoped** INSERT/UPDATE policy pair. The member policies are untouched — "never loosen the policy" means don't relax `user_id = auth.uid()` on the member's, and it wasn't. |
| Every §7 rule must evaluate against the **bettor** | Identity is now a parameter of one shared write path (`lib/placement-write.ts`), used by both routes, instead of an `auth.getUser()` call inside the handler |
| `odds_at_placement` still snapshots at write | Untouched — the admin path reuses `planWrite()` verbatim, revive semantics and soft delete included |

Two decisions worth keeping visible:

- **The DB refuses a forged attribution, not just the route.** Both admin policies carry `placed_by_user_id = auth.uid()` in `WITH CHECK`, so an admin cannot write a row claiming somebody else entered it. The audit trail doesn't depend on the route being honest — which is the property a September dispute actually needs.
- **An admin gate is permission to act *for* someone, not permission to break the rules.** A revoked participant can't be wagered for, a bet that isn't open still refuses, and a phase past its deadline stays closed for admins too.

### ~~Deferred~~ Shipped Aug 9, 2026 — creating a member without an email round-trip ([#124](https://github.com/andrewelong18/ozark-open/issues/124))

Half 1 of #101 was deferred here on purpose: `public.users.id REFERENCES auth.users(id)` and the app held only the anon key, so an account created without an email round-trip needed one of four mechanisms — a service-role key in the prod runtime, a `SECURITY DEFINER` function writing GoTrue's own tables, shadow users with the FK dropped, or an admin-triggered invite (which is still an email). That is a security-posture decision, not an implementation detail.

**Decided Aug 9, 2026 (Andrew): the service-role route.** `POST /api/admin/members` calls `auth.admin.createUser({ email, email_confirm: true })` — confirmed without sending anything. The account is entirely ordinary, so **claiming is free**: a member who later works out the magic link signs into that same account with their fee, name and wagers intact. That's the property none of the other three had. Full rationale, the rejected alternatives and the residual typo risk are in [ADR 0001 §14](../adr/0001-bet-pick-architecture.md).

The cost is a full-bypass key in the Vercel runtime for the first time, against `DATA_MODEL.md` §5 and Sprint 11's reason for choosing pg_cron over Vercel Cron. It is contained to one module and one importer, asserted by `lib/admin-client-containment.test.ts` rather than documented — see `DATA_MODEL.md` §5.1.

**A bug fell out of building it.** There was **no admin `UPDATE` policy on `public.users`** — the only one was the own-row `USING (auth.uid() = id)`. So this sprint's own #99 display-name edit was a **silent no-op for every user but the acting admin**: RLS filtered the row out, zero rows matched, PostgREST returned success with no error, and the console said "saved". The route's comment credited `guard_users_self_update` for letting the write land, but RLS is evaluated *before* the trigger, so no row ever reached it. Every local harness runs SQL as superuser, where RLS is bypassed — nothing local could have caught it, which is filed as [#154](https://github.com/andrewelong18/ozark-open/issues/154) with the three ways to close it. Fixed in `20260814000000_admin_manages_users.sql` plus a zero-row check in `writeDisplayName()`, because "no error" was never evidence the write happened.

| What | Where |
|---|---|
| Admin `UPDATE` policy + `created_by_user_id` | `supabase/migrations/20260814000000_admin_manages_users.sql` |
| The contained service-role client | `lib/supabase/admin.ts` (+ `server-only`) |
| Validation (pure) | `lib/members.ts`, `lib/members.test.ts` |
| The route | `app/api/admin/members/route.ts` — the only importer of the admin client |
| Blast-radius guard | `lib/admin-client-containment.test.ts` |
| The form | `AddMemberBox` in `components/admin/people-console.tsx` |
| The decision | ADR 0001 §14; `DATA_MODEL.md` §3.1 + §5.1 |

**Not verified in-container, deliberately reported rather than glossed:** `auth.admin.createUser` against real GoTrue needs a service-role key and a reachable project, and this container has neither (no `SUPABASE_SERVICE_ROLE_KEY`, no Docker daemon for a local stack, no prod credentials). The validation, the containment and the RLS change are all covered; the GoTrue call itself is the residual gap, filed as [#155](https://github.com/andrewelong18/ozark-open/issues/155) with the walkthrough. The env var ([#152](https://github.com/andrewelong18/ozark-open/issues/152)) and the prod migration ([#153](https://github.com/andrewelong18/ozark-open/issues/153)) are the two manual steps.

### Shipped — Aug 8, 2026

| What | Where |
|---|---|
| Display-name edit (#99) | `components/admin/people-console.tsx` EditPanel + `app/api/admin/participants/route.ts` PATCH |
| Rule validation + derived limits (#100) | `lib/rules.ts` + `lib/rules.test.ts` (26 tests) |
| House-rules editor (#100) | `app/admin/rules/page.tsx` + `components/admin/rules-form.tsx` → `app/api/admin/rules/route.ts` |
| The spec (#101) | ADR 0001 §13, written before the code |
| Audit column + admin RLS (#101) | `supabase/migrations/20260811000000_admin_placed_wagers.sql`, proven by 9 new checks in `scripts/placement-roundtrip.ts` |
| One write path (#101) | `lib/placement-write.ts` — `/api/placements` and `/api/admin/placements` differ only in identity |
| The on-behalf menu (#101) | `/bets?for=<userId>` + `onBehalfOf` through `BetsMenu` → `BetPlacementCard`; entry point on `/admin/people` |
| "Entered by" on the money page | `app/admin/view/page.tsx` + `lib/admin-view.ts` |
| Admin panel | Five buttons: People · Import Bets · View All · Close & Settle · **House Rules** |

Notes for whoever reads this next:

- **Admin edit and remove are in scope** (confirmed Aug 8, 2026). "Place wagers on their behalf" covers the whole lifecycle, not just the first write: editing is the same handler, and removal is the only way to undo a wager entered for the wrong member. Both are soft — `DELETE /api/admin/placements` stamps `deleted_at` like every other removal, so the row keeps its history.
- **The prod migration is applied and verified** (Aug 8, 2026) — column nullable, both new policies present, member policies unchanged. It's additive, so merge order isn't load-bearing.
- **No backfill on `placed_by_user_id`.** NULL means the bettor placed it themselves, which is already true of every row written before this sprint. There is no retroactive claim being made about history.
- Verified locally: `npm test` **298 pass** (from 265), `npx tsc --noEmit` clean, `npm run build`, `local-db-verify.sh`, and `dry-run-verify.sh` end to end with the pool unchanged at $425 − $32 = **$393**, 0 pending.
- Browser walkthrough is filed as [#125](https://github.com/andrewelong18/ozark-open/issues/125) — this container has no Supabase env vars, so no dev server.

### Out of scope (don't build)

- **A role system.** `is_admin` is a boolean and stays one. No tiers, no per-permission grants.
- **Bulk approve.** Approval sets a per-person entry fee — a judgement call per row, not a checkbox sweep. (Carried forward from Sprint 20.)
- **Editing the bet menu in the app.** The spreadsheet is the CMS (ADR 0001). Nothing here touches bets or picks.
- **Notifications of any kind.** Still globally out of scope; the chase lists stay copyable text so nagging happens in the group text where it already happens.
