# Phase 2 — Tournament & Participants Setup Design

**Date:** 2026-05-07
**Goal:** Create tournament and participant tables, seed the 2026 tournament, and build the authenticated `/dashboard` page showing tournament status and the logged-in user's participation status.

---

## Scope

- Database migration: `tournaments` + `tournament_participants` tables with RLS
- Seed: one 2026 tournament row (status `'upcoming'`)
- Dashboard page: two-card layout — tournament info and participant status
- No participant admin UI — Studio is the tool for adding participants

Out of scope: bet menu, placement UI, anything from Phase 3+.

---

## Approach

Single Server Component dashboard page. Two Supabase queries server-side: find the current tournament (status `upcoming` or `active`), then find the user's participant row. Status transitions (upcoming → active) are done in Supabase Studio — no code change needed.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260507000001_tournaments.sql` | Create | `tournaments` + `tournament_participants` tables, RLS, 2026 seed row |
| `app/dashboard/page.tsx` | Replace stub | Async Server Component — queries and renders tournament + participant status |

---

## Section 1: Database Migration

### `supabase/migrations/20260507000001_tournaments.sql`

**`tournaments` table** (exact schema from DATA_MODEL.md):

```sql
CREATE TABLE public.tournaments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  year                int NOT NULL UNIQUE,
  status              text NOT NULL CHECK (status IN ('upcoming', 'active', 'completed')),
  entry_fee_min       int NOT NULL DEFAULT 20,
  entry_fee_max       int NOT NULL DEFAULT 50,
  min_bets_per_round  int NOT NULL DEFAULT 5,
  max_bets_per_round  int NOT NULL DEFAULT 10,
  max_single_bet_pct  numeric(3,2) NOT NULL DEFAULT 0.50,
  max_single_bet_cap  int NOT NULL DEFAULT 20,
  max_self_bet_pct    numeric(3,2) NOT NULL DEFAULT 0.25,
  max_self_bet_cap    int NOT NULL DEFAULT 10,
  created_at          timestamptz NOT NULL DEFAULT now()
);
```

**`tournament_participants` table**:

```sql
CREATE TABLE public.tournament_participants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tournament_id  uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  entry_fee      int NOT NULL CHECK (entry_fee BETWEEN 20 AND 50),
  is_player      boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, tournament_id)
);
```

**RLS — `tournaments`:**
```sql
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tournaments"
  ON public.tournaments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can write tournaments"
  ON public.tournaments FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

**RLS — `tournament_participants`:**
```sql
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read participants"
  ON public.tournament_participants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can write participants"
  ON public.tournament_participants FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

**2026 seed row:**
```sql
INSERT INTO public.tournaments (
  name, year, status,
  entry_fee_min, entry_fee_max,
  min_bets_per_round, max_bets_per_round,
  max_single_bet_pct, max_single_bet_cap,
  max_self_bet_pct, max_self_bet_cap
) VALUES (
  'Ozark Open 2026', 2026, 'upcoming',
  20, 50,
  5, 10,
  0.50, 20,
  0.25, 10
);
```

---

## Section 2: Dashboard Page

### `app/dashboard/page.tsx`

Async Server Component. Replaces the "Dashboard coming soon." stub.

**Data fetching:**
1. Get current user from `supabase.auth.getUser()`
2. Query current tournament: `SELECT * FROM tournaments WHERE status IN ('upcoming', 'active') ORDER BY year DESC LIMIT 1`
3. If tournament found, query participant row: `SELECT * FROM tournament_participants WHERE user_id = <uid> AND tournament_id = <tid> LIMIT 1`

**Renders:**

No tournament found → centered message: "No active tournament found."

Tournament found → two `Card` components stacked vertically, centered with max-width:

*Tournament card:*
- Title: tournament `name` (e.g., "Ozark Open 2026")
- `Badge` showing status: "Upcoming" (neutral) or "Betting Open" (green) based on `status` value

*Participation card:*
- Title: "Your Registration"
- If participant row exists: "You're in." + "Entry fee: $`{entry_fee}`"
- If no participant row: "You're not registered for this tournament." + "Contact an admin to be added."

**New shadcn component needed:** `Badge` — add via `npx shadcn@latest add badge`

---

## Status → UI Mapping

| `tournaments.status` | Badge label | Badge style |
|---|---|---|
| `'upcoming'` | Upcoming | `variant="secondary"` |
| `'active'` | Betting Open | `variant="default"` |
| `'completed'` | Completed | `variant="outline"` |

The dashboard never shows `completed` tournaments (query filters to `upcoming` or `active` only), but the mapping is defined here for completeness.

---

## Done When

- `public.tournaments` and `public.tournament_participants` tables exist in Supabase
- 2026 tournament row exists with status `'upcoming'`
- Logged-in users at `/dashboard` see the tournament card and their registration status
- A user with a `tournament_participants` row sees their entry fee
- A user without a row sees the "not registered" message
- Admins can add/remove participants in Studio and the dashboard reflects the change on next load
