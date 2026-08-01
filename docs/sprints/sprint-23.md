# Sprint 23 — Admin control surface

> Part of the [Ozark Open roadmap](../ROADMAP.md). **Scope-expanding sprint.** `CLAUDE.md` listed custom admin UI beyond import/people/view as out of scope until Jul 31, 2026; the dry run superseded that. The scope lines in `CLAUDE.md` and `ROADMAP.md` are already updated — this sprint builds what they now allow.

**Goal:** give Pat the controls he asked for, so running the tournament stops requiring database access.

**Target:** before the Aug 28 feature freeze · **Blockers:** none hard. The bet-on-behalf item is large enough to deserve its own spec pass before building.

**Reads:** `docs/sprints/sprint-20.md` (the `/admin/people` console this extends), `docs/DATA_MODEL.md` §3.3/§3.8, `lib/placements.ts` (`TOURNAMENT_RULE_COLUMNS`, `toTournamentRules`), `docs/adr/0001-bet-pick-architecture.md` §7.

### Why this sprint

Pat drove the whole dry run and hit three walls that all had the same shape: *the app can show him the problem but not let him fix it.* The fourth wall — no UI for the chase list or the final unlock — is [Sprint 25](sprint-25.md).

- [ ] **Admins can edit a display name** ([#99](https://github.com/andrewelong18/ozark-open/issues/99)). Members self-set once at onboarding; after that it's admin-owned, but no admin UI exists, so a typo is permanent without Studio. **The database already permits this** — `guard_users_self_update` exempts admins — so this is purely the missing form field on `/admin/people`. Note `display_name` is load-bearing: `lib/import.ts` links picks to people by matching it, so a wrong name silently disables the self-bet cap, the self-pick flag and the opponent block for that person. This is a rules fix, not a cosmetic one.
- [ ] **House-rules editor** ([#100](https://github.com/andrewelong18/ozark-open/issues/100)). All eight parameters already live on the `tournaments` row and reach validation through `toTournamentRules()` — `CLAUDE.md`'s no-hardcoded-figures rule held, so this is a form over an existing row rather than a refactor. Two requirements beyond the form: **server-side validation of the values themselves** (a min above the max must be refused), and **show the derived limits as Pat types** — the per-entry-fee table (`$25 → $12` because the code floors, `$50 → $20` because the cap binds) is what he actually reasons about and it isn't legible from the raw parameters. Changing a rule must not retroactively invalidate placed wagers; say so in the UI.
- [ ] **Add a member and place wagers on their behalf** ([#101](https://github.com/andrewelong18/ozark-open/issues/101)). The largest item from the session — **write its own spec before building.** Two separable halves: creating an account without an email round-trip, and placing wagers as that member.

  The second half has teeth, and none of these are negotiable: every §7 rule must evaluate against the **bettor**, not the acting admin (pass the member's `Bettor` into `lib/validation.ts`, or the self-bet cap and opponent block silently apply to the wrong person) · `bet_placements` must record **who actually placed the wager**, because every row is money and a September dispute has to be reconstructable · `requires_admin_review` still keys off the *member* being the pick's player · writing for another user necessarily bypasses the own-rows-only RLS policy, so do it in a server route behind an explicit admin gate, **never by loosening the policy** · `odds_at_placement` still snapshots at write time.

- [ ] **Docs:** this file; `README.md`'s admin workflow section; `ROADMAP.md` index + status summary. The `CLAUDE.md` and `ROADMAP.md` scope lines were already updated on Jul 31 — check they still describe what actually shipped.

**Done when:** Pat can correct a display name and see that person's picks link on the next upload; change any house rule from the app, with bad values refused; and add a member and place a wager for them that is refused when it breaks a §7 rule *for that member*, with the placement recording who entered it.

### Out of scope (don't build)

- **A role system.** `is_admin` is a boolean and stays one. No tiers, no per-permission grants.
- **Bulk approve.** Approval sets a per-person entry fee — a judgement call per row, not a checkbox sweep. (Carried forward from Sprint 20.)
- **Editing the bet menu in the app.** The spreadsheet is the CMS (ADR 0001). Nothing here touches bets or picks.
- **Notifications of any kind.** Still globally out of scope; the chase lists stay copyable text so nagging happens in the group text where it already happens.
