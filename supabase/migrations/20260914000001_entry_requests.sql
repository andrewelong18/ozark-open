-- Sprint 30 (PRD §12 A26): the entry request.
--
-- Andrew, Sept 14, 2026: "a form for each player to request for betting in
-- the app. It should include dollar amount requested and allow them to slide
-- how much they want applied to phase 1 and phase 2. […] The user should not
-- be able to add more — this is their one time to be able to add money."
--
-- WHY A TABLE OF ITS OWN, and not two columns on tournament_participants.
-- Approval CREATES the participant row, and that row IS betting eligibility
-- (PRD §12 A12/A13) — members cannot write it, and must not. A request is what
-- the member asked for; the participant row is what an admin recorded after
-- the money arrived. Keeping them apart keeps the pool math's one source of
-- truth where it was.
--
-- "ONE TIME" IS THE DATABASE'S PROMISE, NOT THE FORM'S. UNIQUE (tournament_id,
-- user_id) plus no member UPDATE or DELETE policy: a second request collides,
-- an edit matches zero rows. The form warns before the tap; this is what makes
-- the warning true.
--
-- The $20–$50 per-phase bounds are NOT a CHECK here. Rule parameters live on
-- the tournaments row (CLAUDE.md), and this is a request, not money: a hand-
-- crafted PostgREST insert can only produce an odd request for an admin to
-- read, never a wager or a pool input. The API validates against the
-- tournaments row (lib/entry-request.ts); what is always true is what the
-- CHECKs keep.

CREATE TABLE public.entry_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phase1_amount  int NOT NULL DEFAULT 0 CHECK (phase1_amount >= 0),
  phase2_amount  int NOT NULL DEFAULT 0 CHECK (phase2_amount >= 0),
  is_player      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_requests_some_money CHECK (phase1_amount + phase2_amount > 0),
  UNIQUE (tournament_id, user_id)
);

COMMENT ON TABLE public.entry_requests IS
  'What a member asked to put in, once per tournament (Sprint 30 / PRD §12 A26). Read by an admin at approval, which prefills the participant row''s per-phase entries and is_player. NEVER a pool input: the pot is built from tournament_participants. Not in take_snapshot() — it is not money.';
COMMENT ON COLUMN public.entry_requests.phase1_amount IS
  'Requested Phase 1 entry in whole dollars; 0 = sitting Phase 1 out. Bounds are validated against the tournaments row by the API, not here.';
COMMENT ON COLUMN public.entry_requests.phase2_amount IS
  'Requested Phase 2 entry in whole dollars; 0 = sitting Phase 2 out.';
COMMENT ON COLUMN public.entry_requests.is_player IS
  'The member''s own answer to "are you playing in the tournament?" — prefills tournament_participants.is_player at approval; the admin can still override it.';

ALTER TABLE public.entry_requests ENABLE ROW LEVEL SECURITY;

-- A member writes exactly one row, as themselves. No UPDATE, no DELETE: the
-- request is immutable from the member's side, which is the "one time" rule.
CREATE POLICY "Members request their own entry"
  ON public.entry_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members read their own request"
  ON public.entry_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- The house FOR ALL shape (DATA_MODEL §5): admins read every request on
-- /admin/people, and can clear a mistaken one so the member may try again.
CREATE POLICY "Admins manage entry requests"
  ON public.entry_requests FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
