-- tournaments table
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

-- tournament_participants table
CREATE TABLE public.tournament_participants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tournament_id  uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  entry_fee      int NOT NULL CHECK (entry_fee BETWEEN 20 AND 50),
  is_player      boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, tournament_id)
);

-- RLS: tournaments
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

-- RLS: tournament_participants
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

-- Seed: 2026 tournament
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
