-- Bet/pick rework (ADR 0001, Sprint 1): bets become menu headings with picks;
-- odds, probabilities, and results live per pick and arrive from the admin's
-- spreadsheet. Clean rebuild — no production bet data exists.

-- Old shape out (bet_subjects first: it references bets)
DROP TABLE public.bet_subjects;
DROP TABLE public.bets;
DROP TABLE public.bet_categories;

-- bet_categories: display info + the one wagering constraint that differs by
-- category. No resolution_type — the app never adjudicates (ADR 0001 §3).
CREATE TABLE public.bet_categories (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL UNIQUE,
  slug                   text NOT NULL UNIQUE,
  allows_multiple_picks  boolean NOT NULL,
  description            text
);

-- bets: menu headings, upserted by the sheet's bet_id. No odds or outcome —
-- those are per pick; "resolved" is derived (closed + non-pending results).
CREATE TABLE public.bets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id      uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  category_id        uuid NOT NULL REFERENCES public.bet_categories(id),
  sheet_bet_id       int NOT NULL,
  title              text NOT NULL,
  phase              int NOT NULL CHECK (phase IN (1, 2)),
  -- round_2 allowed by schema but unused by policy — no Round 2 bets are released
  round              text NOT NULL CHECK (round IN ('tournament', 'round_1', 'round_2', 'round_3')),
  status             text NOT NULL DEFAULT 'hidden'
                       CHECK (status IN ('hidden', 'open', 'closed')),
  total_probability  numeric,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, sheet_bet_id)
);

-- bet_picks: the options within a bet — what participants wager on. Upserted
-- by the sheet's pick_id. Display values (fractional_odds, probability) are
-- sheet-supplied verbatim; american_odds is for payout math only.
CREATE TABLE public.bet_picks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id           uuid NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
  sheet_pick_id    int NOT NULL,
  label            text NOT NULL,
  american_odds    int NOT NULL CHECK (american_odds != 0),
  fractional_odds  text NOT NULL,
  probability      numeric NOT NULL,
  -- name-matched at import (stroke suffixes stripped); NULL for "Field",
  -- "Yes"/"No", and unmatched names
  player_user_id   uuid REFERENCES public.users(id),
  result           text NOT NULL DEFAULT 'pending'
                     CHECK (result IN ('pending', 'hit', 'miss', 'push', 'void')),
  UNIQUE (bet_id, sheet_pick_id)
);

-- RLS: bet_categories
ALTER TABLE public.bet_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bet_categories"
  ON public.bet_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can write bet_categories"
  ON public.bet_categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- RLS: bets (participants see non-hidden; admins see all and can write)
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read non-hidden bets"
  ON public.bets FOR SELECT TO authenticated
  USING (status != 'hidden');

CREATE POLICY "Admins can read all bets"
  ON public.bets FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can write bets"
  ON public.bets FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- RLS: bet_picks (readable whenever the parent bet is readable)
ALTER TABLE public.bet_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read picks of non-hidden bets"
  ON public.bet_picks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bets b
      WHERE b.id = bet_id AND b.status != 'hidden'
    )
  );

CREATE POLICY "Admins can read all bet_picks"
  ON public.bet_picks FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can write bet_picks"
  ON public.bet_picks FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed: the five categories (ADR 0001 §2). Tie rules are informational —
-- they document how the admin's workbook arrives at each pick's result.
INSERT INTO public.bet_categories (name, slug, allows_multiple_picks, description) VALUES
  ('Top Finisher',   'top_finisher',   true,  'Winner of a round or the tournament. Ties hit. Multiple picks allowed.'),
  ('Top X Finisher', 'top_x_finisher', true,  'Finish in the top X (e.g. Top 4). Ties hit. Multiple picks allowed.'),
  ('Match',          'match',          false, 'Head-to-head, straight up or with strokes. Ties push. One pick only; betting on your opponent is prohibited.'),
  ('Group Match',    'group_match',    false, 'Best of 3+ players, straight up or with strokes. Ties hit. One pick only; betting on your opponent is prohibited.'),
  ('Prop Bet',       'prop_bet',       true,  'Special-rules bets (e.g. "best ball under 80.5"). Picks per the bet''s option list. Adjudicated manually in the workbook.');

-- tournaments: wagering counts are per phase, per pick (ADR 0001 §10)
ALTER TABLE public.tournaments RENAME COLUMN min_bets_per_round TO min_picks_per_phase;
ALTER TABLE public.tournaments RENAME COLUMN max_bets_per_round TO max_picks_per_phase;

-- tournament_participants: entry-fee bounds live on the tournaments row
-- (entry_fee_min/max) and are enforced in app code — the schema keeps only
-- what is always true (DATA_MODEL §6 known inconsistency).
ALTER TABLE public.tournament_participants
  DROP CONSTRAINT tournament_participants_entry_fee_check;
ALTER TABLE public.tournament_participants
  ADD CONSTRAINT tournament_participants_entry_fee_check CHECK (entry_fee > 0);
