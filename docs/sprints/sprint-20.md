# Sprint 20 — Admin People Console (roster + participants, merged)

> Part of the [Ozark Open roadmap](../ROADMAP.md). One sprint = one sitting; don't start while blockers are open. **Consolidation sprint** — it ships no new capability, it makes two existing pages into the one page they should have been. Net effect on the admin surface is *subtraction*: four custom admin pages become three.

**Goal:** one admin page that shows every person's stage in the access funnel and attaches the only action that makes sense for that stage — so "why can't Jake bet?" is answered and fixed in one place, without cross-referencing two screens.

**Target:** as time allows before the Aug 28 feature freeze; most valuable *before* you chase ~32 people through signup · **Blockers:** none hard. Sprint 10 (`/admin/roster`, `lib/roster.ts`) and Sprint 16 (`/admin/participants`, the approval API) both code-complete — this sprint is assembly over both.

**Reads:** `docs/sprints/sprint-10.md` and `docs/sprints/sprint-16.md` (the two halves being merged), `docs/DATA_MODEL.md` §3.3/§3.8 (`tournament_participants` and the A11 "row exists = approved" invariant, `tournament_invites`), `docs/adr/0001-bet-pick-architecture.md` §7 (Studio-is-the-CMS minimalism this *reduces* pressure on).

### Why this sprint (the gap it closes)

Sprint 10's roster page was specced Jul 18, two days before Sprint 16 shipped `/admin/participants`. They ended up as two views of one funnel, and the split is actively misleading:

- **They disagree about who exists.** `/admin/participants` filters to `.not("onboarded_at", "is", null)` — a member who clicked the magic link and abandoned onboarding appears on `/admin/roster` and is invisible on `/admin/participants`. Neither page alone tells you the truth.
- **The derivation is duplicated.** `/admin/participants` builds its pending/approved split with an ad-hoc `Map` + `filter`; `lib/roster.ts` derives the same split plus three states it doesn't know about (`not_onboarded`, `fee_unset`, off-roster). One of these is redundant.
- **Seeing and acting are separated.** The page that tells you someone is stuck is not the page where you unstick them.

- [x] **One route.** New `app/admin/people/page.tsx` — the honest name, since it covers people who are *not* participants. `/admin/roster` and `/admin/participants` become redirects (`redirect()` one-liners) so the README's links and muscle memory keep working. Admin panel in `components/profile/profile-tabs.tsx` drops from four buttons to three: **People** · Import Bets · View All.
- [x] **One derivation.** `lib/roster.ts`'s `buildRoster` becomes the single source for the page — delete the ad-hoc pending/approved `Map` in the old participants page. Drop the `onboarded_at` filter on the users query so abandoned-onboarding members stop being invisible. No new status logic; the existing `RosterStatus` + `RosterReason` already cover every stage.
- [x] **Funnel header.** Counts across the top as a funnel, not four unrelated tiles: **No account → Signed in, not onboarded → Awaiting approval → Approved.** Each count is the same filter the table sorts by, so the header and the table can't disagree.
- [x] **Row actions, attached per stage.** One table, worst-first, with the lever only where a lever exists — the action column is empty by design for the top two stages, which is itself the information ("nothing to click; go text them"):

  | Stage | Action |
  |---|---|
  | No account | — (copy email) |
  | Signed in, not onboarded | — |
  | Awaiting approval | **Approve** → entry fee + player flag + verify/correct display name |
  | Approved | **Edit** (fee / player flag) · **Revoke** |

  Reuse `components/admin/participants-manager.tsx`'s approve/edit/revoke UI as the client island; **`/api/admin/participants` needs no change** — same POST/PATCH/DELETE contract, same server-side `is_admin` re-check and fee validation against the `tournaments` row.
- [x] **Bulk invite entry** (folds in [#82](https://github.com/andrewelong18/ozark-open/issues/82)). A paste-a-list box on this page: one `name, email` per line → upsert into `tournament_invites`. The `(tournament_id, lower(email))` unique index makes it idempotent and re-runnable, so a re-paste is safe. This is what makes the invite roster cheap enough to actually fill — without it, the "no account" stage stays empty and the funnel starts one step in.
- [x] **Keep the read-only guarantees that made the roster useful.** Last login (relative, absolute on hover, "Never" for invite-only rows), the off-roster flag, and the copyable plain-text chase lists. Destructive actions (**Revoke**) must not be a bare inline button next to a name — put it behind the row's edit affordance so a glance-and-scroll page can't lose someone their access by mis-tap.
- [x] **Docs:** this file; `README.md` Track 2 (one page, not two); `CLAUDE.md` lines 42 + 54 (the admin-UI list shrinks); `docs/DATA_MODEL.md` §3.8 (the roster page reference); `ROADMAP.md` index + status summary; mark Sprint 10 and Sprint 16's page references as superseded rather than rewriting their history.

**Done when:** from one page an admin can see every person's stage in the funnel — invited-but-absent, signed-in-but-stalled, awaiting approval, approved — and approve, edit, or revoke the ones that need it, without opening a second admin page or Studio. Loading the page with an empty `tournament_invites` still works and simply starts the funnel at "signed in".

### Open decision — how much governance? → **(a), resolved Jul 26, 2026**

The sprint above delivers **"see and control access."** It does not deliver **"prove how access was granted."** `tournament_participants` records no `created_at`, no `approved_by` — so after the fact there's no way to show who approved Jake or when.

- **(a) Access control only ✅ — Pat's call, Jul 26, 2026.** Built exactly as specced. No migration, no schema change; `tournament_participants` and `tournament_invites` are used as they already exist.
- **(b) Add an audit trail** — a small migration adding `approved_by uuid REFERENCES users(id)` + `approved_at timestamptz` to `tournament_participants`, stamped in the POST/PATCH handlers, surfaced as "Approved by Pat, Aug 3" on the row. **Not built.** If a dispute about how someone got in ever needs answering, this is the change to make.

### Shipped — Jul 26, 2026

| What | Where |
|---|---|
| The console | `app/admin/people/page.tsx` + `components/admin/people-console.tsx` |
| The one derivation | `lib/roster.ts` — `funnelStage()` + `Roster.funnel`, `is_player` carried through (`lib/roster.test.ts`) |
| Bulk invite entry (#82) | `lib/invites.ts` + `lib/invites.test.ts` → `app/api/admin/invites/route.ts` |
| Redirects | `app/admin/roster/page.tsx`, `app/admin/participants/page.tsx` → `/admin/people` |
| Deleted | `components/admin/participants-manager.tsx` (its UI moved into the console) |
| Unchanged, as specced | `app/api/admin/participants/route.ts` |

Notes for whoever reads this next:

- **A `fee_unset` row counts under "Awaiting approval"** — it is awaiting a *valid* approval — but keeps the **Edit/Revoke** lever rather than Approve, because its `tournament_participants` row already exists. Anomaly state; a hand-edit is the only way to reach it.
- **No prod SQL to run.** This sprint added no migration.
- Verified by `npm run test` (186 pass), `npm run lint`, `npm run build`. The browser walkthrough is filed as its own issue — this environment has no Supabase env vars.

### Out of scope (don't build)

- **Merging `/admin/view` in.** That page is placements and money — a different job. Three admin pages with clean boundaries (menu · people · money) beats one console.
- **A role system.** `is_admin` is a boolean and stays one. No per-permission grants, no admin tiers.
- **Emailing or notifying anyone from this page.** Notifications are globally out of scope; the chase lists are copyable text precisely so the nagging happens in the group text where it already happens.
- **Bulk approve.** Approval sets a per-person entry fee — it's a judgement call per row, not a checkbox sweep.
- **Editing invites inline.** Paste-to-upsert plus Studio for one-off fixes. No per-row invite CRUD.
