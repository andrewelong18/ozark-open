# Phase 3 — The Bet Menu Design

**Date:** 2026-05-07
**Goal:** Create bet tables, seed the seven categories, and build the `/bets` page showing all non-draft bets grouped by round and category with computed odds display.

---

## Scope

- Database migration: `bet_categories`, `bets`, `bet_subjects` tables with RLS
- Seed: the seven `bet_categories` rows from PRD §6
- `lib/odds.ts`: pure utility for fractional odds and implied probability
- `app/bets/page.tsx`: async Server Component replacing the stub

Sample bets (~5) are added manually in Supabase Studio after the migration — not in code.

Out of scope: bet placement UI (Phase 4), payout display (Phase 6), admin tooling.

---

## Approach

Single async Server Component page. One SQL query fetches all non-draft bets for the current tournament joined to their category, ordered by round → category → bet_number. TypeScript groups the flat result into the nested structure for rendering. Fractional odds and implied probability are computed at render time by `lib/odds.ts`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260507000002_bets.sql` | Create | `bet_categories`, `bets`, `bet_subjects` tables, RLS, seed 7 categories |
| `lib/odds.ts` | Create | Pure functions: `toFractional`, `toImpliedProbability` |
| `app/bets/page.tsx` | Replace stub | Async Server Component — query, group, render |

---

## Section 1: Database Migration

### `supabase/migrations/20260507000002_bets.sql`

**`bet_categories` table:**
```sql
CREATE TABLE public.bet_categories (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  resolution_type  text NOT NULL,
  description      text
);
```

**`bets` table:**
```sql
CREATE TABLE public.bets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  category_id    uuid NOT NULL REFERENCES public.bet_categories(id),
  bet_number     int NOT NULL,
  description    text NOT NULL,
  american_odds  int NOT NULL,
  round_number   int NOT NULL CHECK (round_number IN (1, 2)),
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'open', 'closed', 'resolved')),
  outcome        text CHECK (outcome IN ('hit', 'miss', 'push', 'void')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, bet_number)
);
```

**`bet_subjects` table:**
```sql
CREATE TABLE public.bet_subjects (
  bet_id   uuid NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (bet_id, user_id)
);
```

**RLS — all three tables:**
```sql
ALTER TABLE public.bet_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_subjects ENABLE ROW LEVEL SECURITY;

-- bet_categories: read for all authenticated, write for admins
CREATE POLICY "Authenticated users can read bet_categories"
  ON public.bet_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can write bet_categories"
  ON public.bet_categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- bets: authenticated can read non-draft rows; admins can read all and write
CREATE POLICY "Authenticated users can read non-draft bets"
  ON public.bets FOR SELECT TO authenticated
  USING (status != 'draft');
CREATE POLICY "Admins can read all bets"
  ON public.bets FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY "Admins can write bets"
  ON public.bets FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- bet_subjects: same as bets
CREATE POLICY "Authenticated users can read bet_subjects"
  ON public.bet_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can write bet_subjects"
  ON public.bet_subjects FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
```

**Seed — seven bet categories (PRD §6):**
```sql
INSERT INTO public.bet_categories (name, resolution_type, description) VALUES
  ('Outright Winner',                  'single_winner',           'Exactly one player or "the field" wins; everyone else loses.'),
  ('Top-N Finish + Ties',              'top_n_with_ties',         'Hit if the named player finishes in the top N including ties.'),
  ('Best Finisher (head-to-head)',     'head_to_head_strict',     'Two players: the better finisher wins; pushes if tied.'),
  ('Best Finisher + Ties (group)',     'best_in_group_with_ties', 'One player vs. a group; hits if they finish at or above the others.'),
  ('Best Finisher (Void If Tied)',     'head_to_head_void_on_tie','Two players: better finisher wins; tie voids the bet.'),
  ('Best Finisher among 3+ players',  'best_in_group_strict',    'One player named to be best of three or more; ties do not count.'),
  ('Prop Bets',                        'prop',                    'Manually adjudicated by admin.');
```

---

## Section 2: Odds Utility

### `lib/odds.ts`

Three pure functions with no external dependencies.

**`gcd(a, b)`** — Euclidean GCD, used internally to simplify fractions.

**`toFractional(americanOdds: number): string`**
- Positive odds (e.g. +150): numerator = odds, denominator = 100. Simplify with GCD. Return `"${n}-${d}"`.
- Negative odds (e.g. -130): numerator = 100, denominator = abs(odds). Simplify with GCD. Return `"${n}-${d}"`.
- Examples: +150 → `"3-2"`, -130 → `"10-13"`, +175 → `"7-4"`, -200 → `"1-2"`

**`toImpliedProbability(americanOdds: number): string`**
- Positive odds: `100 / (odds + 100)`
- Negative odds: `abs(odds) / (abs(odds) + 100)`
- Return as percentage string rounded to one decimal place.
- Examples: +150 → `"40.0%"`, -130 → `"56.5%"`, +100 → `"50.0%"`

---

## Section 3: Bets Page

### `app/bets/page.tsx`

Async Server Component replacing the "Bet menu coming soon." stub.

**Data fetching:**

Query bets for the current tournament (status IN upcoming/active), non-draft only, with category name:
```sql
SELECT
  b.id, b.bet_number, b.description, b.american_odds,
  b.round_number, b.status, b.outcome,
  bc.name AS category_name
FROM bets b
JOIN bet_categories bc ON bc.id = b.category_id
JOIN tournaments t ON t.id = b.tournament_id
WHERE t.status IN ('upcoming', 'active')
  AND b.status != 'draft'
ORDER BY b.round_number, bc.name, b.bet_number
```

Using Supabase client:
```ts
const { data } = await supabase
  .from("bets")
  .select(`
    id, bet_number, description, american_odds, round_number, status, outcome,
    bet_categories!inner(name)
  `)
  .eq("tournaments.status", ...) // via join filter
  .neq("status", "draft")
  .order("round_number")
  .order("bet_number")
```

In practice: join to tournaments via a subquery or fetch the tournament id first, then filter bets by tournament_id and status != 'draft'.

**Grouping (TypeScript):**

```ts
type BetRow = {
  id: string
  bet_number: number
  description: string
  american_odds: number
  round_number: 1 | 2
  status: string
  outcome: string | null
  category_name: string
}

type CategoryGroup = { name: string; bets: BetRow[] }
type RoundGroup = { round: number; categories: CategoryGroup[] }
```

Group the flat array into `RoundGroup[]` sorted by round_number, then category name alphabetically.

**Rendering:**

Empty state (no tournament or no bets published): centered "No bets have been published yet."

Per round:
```
<section>
  <h2>Round 1</h2>
  [per category]
    <h3>{category name}</h3>
    <table>
      <thead>: # | Bet | Odds | Fractional | Implied | Status | Outcome
      <tbody>: one row per bet
    </table>
```

Per bet row columns:
- **#**: `bet_number`
- **Bet**: `description`
- **Odds**: American odds formatted with sign (e.g. `+150`, `-130`)
- **Fractional**: `toFractional(american_odds)` (e.g. `3-2`)
- **Implied**: `toImpliedProbability(american_odds)` (e.g. `40.0%`)
- **Status**: shadcn `Badge` — `open` → default, `closed` → secondary, `resolved` → outline
- **Outcome**: shadcn `Badge` if `outcome` is non-null — `hit` → `variant="default"`, `miss` → `variant="destructive"`, `push`/`void` → `variant="secondary"`

No new shadcn components needed.

---

## Odds Math Reference

| American odds | Fractional | Implied probability |
|---|---|---|
| +150 | 3-2 | 40.0% |
| -130 | 10-13 | 56.5% |
| +100 | 1-1 | 50.0% |
| -200 | 1-2 | 66.7% |
| +175 | 7-4 | 36.4% |
| -110 | 10-11 | 52.4% |

---

## Done When

- `bet_categories`, `bets`, `bet_subjects` tables exist in Supabase
- Seven category rows are seeded
- Admins can add sample bets in Studio and see them appear at `/bets` on next page load
- `/bets` shows bets grouped by round then category, with all five columns rendering correctly
- Status and outcome badges display with correct variants
