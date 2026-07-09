# Data Model

The database schema for the Ozark Open Sportsbook. This is the most important file in the repo — get this right and the rest of the app falls into place. Get it wrong and you'll be rewriting code for years.

---

## 1. Design Principles

1. **Generic bets, not hardcoded ones.** The seven bet categories from the original Sportsbook are stored as data, not code. Adding a new category requires inserting a row into `bet_categories`, not editing source files.
2. **Evergreen identity.** A user has one record forever. Tournaments are separate entities. A user joins a tournament via a join table.
3. **Outcomes attach to bets, not placements.** A bet hits or misses once, globally. We don't store hit/miss per-placement.
4. **Theoretical payout is computed, never stored.** It's a function of `placement.amount`, `bet.american_odds`, and `bet.outcome`. A Postgres view derives it on demand.
5. **Constraints in the right place.** Schema enforces things that are always true (a placement must have positive amount). App code enforces things that are contextual (you can't have more than 10 placements in a round).

---

## 2. Schema Overview

```mermaid
erDiagram
    users ||--o{ tournament_participants : "joins"
    users ||--o{ bet_placements : "places"
    tournaments ||--o{ tournament_participants : "has"
    tournaments ||--o{ bets : "contains"
    bet_categories ||--o{ bets : "categorizes"
    bets ||--o{ bet_placements : "receives"
    bets ||--o{ bet_subjects : "names"
    users ||--o{ bet_subjects : "is_subject_of"

    users {
        uuid id PK
        text email
        text display_name
        boolean is_admin
        timestamptz created_at
    }

    tournaments {
        uuid id PK
        text name
        int year
        text status
        int entry_fee_min
        int entry_fee_max
        int min_bets_per_round
        int max_bets_per_round
        timestamptz created_at
    }

    tournament_participants {
        uuid id PK
        uuid user_id FK
        uuid tournament_id FK
        int entry_fee
        boolean is_player
    }

    bet_categories {
        uuid id PK
        text name
        text resolution_type
        text description
    }

    bets {
        uuid id PK
        uuid tournament_id FK
        uuid category_id FK
        int bet_number
        text description
        int american_odds
        int round_number
        text status
        text outcome
        timestamptz created_at
    }

    bet_subjects {
        uuid bet_id FK
        uuid user_id FK
    }

    bet_placements {
        uuid id PK
        uuid user_id FK
        uuid bet_id FK
        int amount
        timestamptz created_at
        timestamptz updated_at
    }
```

---

## 3. Table Definitions

### 3.1 `users`

One row per person who ever logs in. Persists across tournaments forever.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Matches `auth.users.id` from Supabase Auth |
| `email` | `text` UNIQUE NOT NULL | Used for magic-link login |
| `display_name` | `text` NOT NULL | E.g. "Dan Mercer" — what shows on bets and leaderboards |
| `is_admin` | `boolean` NOT NULL DEFAULT `false` | Admins are Pat, Jake, Steve, Andrew |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

**Why no `password` column:** there are no passwords. Authentication is magic-link only via Supabase Auth.

**Why no `venmo_handle` column:** the app does not handle payment. Pat keeps Venmo info in his phone, as today.

---

### 3.2 `tournaments`

One row per Ozark Open year. Holds the rule parameters that govern that year's pool.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` NOT NULL | E.g. "Ozark Open 2026" |
| `year` | `int` NOT NULL UNIQUE | E.g. 2026 |
| `status` | `text` NOT NULL CHECK IN (`'upcoming'`, `'active'`, `'completed'`) | Controls visibility |
| `entry_fee_min` | `int` NOT NULL DEFAULT 20 | Lower bound on entry |
| `entry_fee_max` | `int` NOT NULL DEFAULT 50 | Upper bound on entry |
| `min_bets_per_round` | `int` NOT NULL DEFAULT 5 | |
| `max_bets_per_round` | `int` NOT NULL DEFAULT 10 | |
| `max_single_bet_pct` | `numeric(3,2)` NOT NULL DEFAULT 0.50 | Half of entry, by default |
| `max_single_bet_cap` | `int` NOT NULL DEFAULT 20 | Hard cap regardless of entry size |
| `max_self_bet_pct` | `numeric(3,2)` NOT NULL DEFAULT 0.25 | Quarter of entry |
| `max_self_bet_cap` | `int` NOT NULL DEFAULT 10 | Hard cap on self-bets |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

**Why store rule parameters per-tournament:** the original memo's rules might evolve. Storing them on the tournament row means the 2026 rules are preserved exactly even if 2027 changes them.

---

### 3.3 `tournament_participants`

Join table connecting users to tournaments. A user is "in" a tournament for a given year if a row exists here.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL FK → `users.id` | |
| `tournament_id` | `uuid` NOT NULL FK → `tournaments.id` | |
| `entry_fee` | `int` NOT NULL CHECK (`entry_fee BETWEEN 20 AND 50`) | The participant's chosen entry, $20–$50 |
| `is_player` | `boolean` NOT NULL DEFAULT `true` | True if they're playing golf, false if they're only betting (rare) |

**Constraint:** UNIQUE (`user_id`, `tournament_id`) — a user can only join a tournament once.

**Why `is_player`:** the rules talk about "betting on yourself" — that only matters if the bettor is also a player. Non-playing entrants (if any) are exempt from the self-bet rule.

---

### 3.4 `bet_categories`

The seven categories from the original Sportsbook, stored as configurable data.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` NOT NULL UNIQUE | E.g. "Top 4 Finish + Ties" |
| `resolution_type` | `text` NOT NULL | Enum: `'single_winner'`, `'top_n_with_ties'`, `'head_to_head_strict'`, `'best_in_group_with_ties'`, `'head_to_head_void_on_tie'`, `'best_in_group_strict'`, `'prop'` |
| `description` | `text` | Human-readable explanation |

**Seed data** (loaded by the initial migration): the seven categories listed in PRD §6.

**Adding an eighth category later:** insert a row here. If the new `resolution_type` requires custom outcome logic, add a small case to `lib/payouts.ts` and ship it. This is the one piece that requires a code change, by design — payout math is too important to leave to runtime configuration.

---

### 3.5 `bets`

The bet menu. One row per bet number (#1, #2, …) per tournament.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tournament_id` | `uuid` NOT NULL FK → `tournaments.id` | |
| `category_id` | `uuid` NOT NULL FK → `bet_categories.id` | |
| `bet_number` | `int` NOT NULL | Friendly identifier — the "#3" in "$3 on #3" |
| `description` | `text` NOT NULL | E.g. "Dan Mercer to win tournament" |
| `american_odds` | `int` NOT NULL | Positive or negative (e.g., `+150`, `-130`). Zero is invalid. |
| `round_number` | `int` NOT NULL CHECK IN (1, 2) | Round 1 (Thursday) or Round 2 (Saturday) |
| `status` | `text` NOT NULL CHECK IN (`'draft'`, `'open'`, `'closed'`, `'resolved'`) DEFAULT `'draft'` | |
| `outcome` | `text` CHECK IN (`'hit'`, `'miss'`, `'push'`, `'void'`) | NULL until status = resolved |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

**Constraint:** UNIQUE (`tournament_id`, `bet_number`) — bet numbers don't repeat within a tournament.

**Why no `fractional_odds` column:** computed from `american_odds` at render time. Single source of truth.

**Why no `implied_probability` column:** also computed from `american_odds`. Single source of truth.

---

### 3.6 `bet_subjects`

Which players a bet is "about." Used for self-bet detection. A bet can name zero, one, or many players.

| Column | Type | Notes |
|---|---|---|
| `bet_id` | `uuid` NOT NULL FK → `bets.id` | |
| `user_id` | `uuid` NOT NULL FK → `users.id` | The player named in the bet |

**Constraint:** PRIMARY KEY (`bet_id`, `user_id`).

**Examples:**
- "Dan Mercer to win" → one row: (bet_id, Dan Mercer's user_id)
- "Best Finisher among Jake Kohne / Steve Jones / Mike Yenzer" → three rows
- "Most even-numbered scores" (a prop bet) → zero rows; not about any specific player

**Self-bet detection** at submission time: if `user_id` of the placement matches any `user_id` in `bet_subjects` for that bet, flag for admin review.

---

### 3.7 `bet_placements`

Each individual wager: one row per (user, bet) pair where money was placed.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL FK → `users.id` | The bettor |
| `bet_id` | `uuid` NOT NULL FK → `bets.id` | The bet being placed |
| `amount` | `int` NOT NULL CHECK (`amount > 0`) | Whole dollars, $1 minimum |
| `requires_admin_review` | `boolean` NOT NULL DEFAULT `false` | Set on write when the bettor appears in `bet_subjects` for the bet (self-bet flag, PRD §7). Added in Sprint 1. |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | Updated on edit |

**Constraint:** UNIQUE (`user_id`, `bet_id`) — a user can only have one placement per bet. (Editing the placement updates `amount` rather than creating a second row.)

**Constraints NOT enforced at the schema level** (these live in app code because they require cross-row checks):
- Total placements per user per round between 5 and 10.
- Sum of placements per user per round ≤ entry fee for that tournament.
- Single placement amount ≤ `min(max_single_bet_pct × entry_fee, max_single_bet_cap)`.
- Sum of self-bet placements ≤ `min(max_self_bet_pct × entry_fee, max_self_bet_cap)`.

---

## 4. The Payout View

A read-only Postgres view that computes each placement's theoretical payout. Defined in a migration; queryable like a table.

```sql
CREATE VIEW placement_payouts_view AS
SELECT
    p.id              AS placement_id,
    p.user_id,
    p.bet_id,
    p.amount,
    b.outcome,
    b.american_odds,
    b.tournament_id,
    CASE
        WHEN b.outcome = 'hit' AND b.american_odds > 0
            THEN p.amount + (p.amount * b.american_odds / 100.0)
        WHEN b.outcome = 'hit' AND b.american_odds < 0
            THEN p.amount + (p.amount * 100.0 / ABS(b.american_odds))
        WHEN b.outcome IN ('push', 'void')
            THEN p.amount
        WHEN b.outcome = 'miss'
            THEN 0
        ELSE NULL  -- bet not yet resolved
    END AS theoretical_payout
FROM bet_placements p
JOIN bets b ON b.id = p.bet_id;
```

The actual-payout proportional split runs in TypeScript at render time, since it requires summing across all users (one query, then arithmetic).

---

## 5. Row-Level Security Highlights

Policies live inline in each table's migration file under `supabase/migrations/` (e.g., `20260507000000_users_table.sql`, `20260507000001_tournaments.sql`, `20260507000002_bets.sql`). Summary:

- **`bets`**: anyone authenticated can `SELECT` rows where `status != 'draft'`. Only admins can `INSERT` / `UPDATE` / `DELETE`.
- **`bet_placements`**: a user can `SELECT` / `INSERT` / `UPDATE` / `DELETE` their own rows. Other users' placements are visible only when the corresponding bet's status is `closed` or `resolved`. Admins can read all.
- **`tournament_participants`**: anyone authenticated can `SELECT`. Only admins can `INSERT` / `UPDATE`.
- **`bet_categories`, `tournaments`, `bets`, `bet_subjects`**: read by all authenticated users; write by admins only.
- **`users`**: a user can read their own row. Admins can read all.

---

## 6. Migration Strategy

- All schema changes are SQL files in `supabase/migrations/`, named with timestamps (`20260507000000_users_table.sql`).
- Apply locally with `npx supabase db push` or by pasting into the Supabase SQL Editor.
- Never edit the schema directly in Supabase Studio — only the data. Schema changes go through migration files so the production and local environments stay in sync.

**Migrations shipped so far** (one per phase, each with its tables + RLS + seeds):
- `20260507000000_users_table.sql` — `users`, `is_admin()` helper, new-user trigger
- `20260507000001_tournaments.sql` — `tournaments`, `tournament_participants`, 2026 seed
- `20260507000002_bets.sql` — `bet_categories`, `bets`, `bet_subjects`, seven-category seed

**Still to come** (see `ROADMAP.md`): `bet_placements` (Sprint 1), `placement_payouts_view` (Sprint 5).

**Known inconsistency to fix in the Sprint 1 migration:** `tournament_participants.entry_fee` currently has a hardcoded `CHECK (entry_fee BETWEEN 20 AND 50)`, but the entry-fee bounds are supposed to live on the `tournaments` row (`entry_fee_min` / `entry_fee_max`) per the "rules are data, not constants" convention. Fix: drop the hardcoded CHECK (keep `entry_fee > 0`) and enforce the per-tournament bounds in `lib/validation.ts` / at participant creation instead.
