-- bet_categories table
CREATE TABLE public.bet_categories (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  resolution_type  text NOT NULL,
  description      text
);

-- bets table
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

-- bet_subjects table
CREATE TABLE public.bet_subjects (
  bet_id   uuid NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (bet_id, user_id)
);

-- RLS: bet_categories
ALTER TABLE public.bet_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bet_categories"
  ON public.bet_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can write bet_categories"
  ON public.bet_categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- RLS: bets (participants see non-draft; admins see all and can write)
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read non-draft bets"
  ON public.bets FOR SELECT TO authenticated
  USING (status != 'draft');

CREATE POLICY "Admins can read all bets"
  ON public.bets FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can write bets"
  ON public.bets FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- RLS: bet_subjects
ALTER TABLE public.bet_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bet_subjects"
  ON public.bet_subjects FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can write bet_subjects"
  ON public.bet_subjects FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed: seven bet categories (PRD §6)
INSERT INTO public.bet_categories (name, resolution_type, description) VALUES
  ('Outright Winner',                 'single_winner',            'Exactly one player or "the field" wins; everyone else loses.'),
  ('Top-N Finish + Ties',             'top_n_with_ties',          'Hit if the named player finishes in the top N including ties.'),
  ('Best Finisher (head-to-head)',    'head_to_head_strict',      'Two players: the better finisher wins; pushes if tied.'),
  ('Best Finisher + Ties (group)',    'best_in_group_with_ties',  'One player vs. a group; hits if they finish at or above the others.'),
  ('Best Finisher (Void If Tied)',    'head_to_head_void_on_tie', 'Two players: better finisher wins; tie voids the bet.'),
  ('Best Finisher among 3+ players', 'best_in_group_strict',     'One player named to be best of three or more; ties do not count.'),
  ('Prop Bets',                       'prop',                     'Manually adjudicated by admin.');
