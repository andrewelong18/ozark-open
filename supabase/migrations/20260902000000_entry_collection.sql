-- Entry collection, recorded — not decided.
--
-- The pool is Σ entry fees − Σ voided stakes (ADR 0001 §9), computed from fees
-- the app has always ASSUMED were collected. tournament_participants carries
-- the fee and nothing about whether the money arrived, so on payout night the
-- app can answer "what do I get" to the cent and cannot answer "who still
-- owes" at all — while lib/settlement.ts writes the very text people are paid
-- from.
--
-- TWO RULES, both deliberate, and the reason this is allowed to exist while
-- OUTSTANDING_DECISIONS.md §3 is still open:
--
--   1. This RECORDS collection; it never DECIDES the mechanism. Whether the
--      $20 minimum comes out of the deposit and the rest by Venmo (Pat's
--      tentative position in §3) is his call, and these columns are true
--      whichever way it lands. `paid_note` is where the mechanism goes, in
--      whatever words the admin used that day.
--
--   2. It is NEVER an input to pool math. An unpaid member still funds the
--      pool on paper — which is exactly why an admin needs to see the gap, and
--      exactly why no payout calculation may ever read these columns. The
--      money math has one input and it stays entry_fee.
--
-- "Paid in full" is DERIVED (paid_amount >= entry_fee), never stored, so a
-- partial payment is representable without a second source of truth to keep in
-- sync with the first.

ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS paid_amount int NOT NULL DEFAULT 0
    CHECK (paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS paid_at     timestamptz,
  ADD COLUMN IF NOT EXISTS paid_note   text;

COMMENT ON COLUMN public.tournament_participants.paid_amount IS
  'Entry money collected so far, in whole dollars. Admin-recorded, never derived. NEVER an input to pool math — the pool is Σ entry_fee (ADR 0001 §9) whether or not the money arrived. Paid in full = paid_amount >= entry_fee.';

COMMENT ON COLUMN public.tournament_participants.paid_at IS
  'When paid_amount was last recorded. NULL means nobody has recorded a payment, which is not the same as "they owe" — read it with paid_amount.';

COMMENT ON COLUMN public.tournament_participants.paid_note IS
  'Free text for how it arrived ("from the deposit", "Venmo 9/2"). The collection MECHANISM is an open stakeholder call (OUTSTANDING_DECISIONS.md §3); this column records what actually happened without prejudging it.';

-- No new RLS policies. Writes to this table are already admin-only, and reads
-- are already authenticated-read-all — a member who hand-queries PostgREST can
-- see these columns exactly as they can already see everyone's entry_fee. That
-- is the existing model rather than a new exposure; the UI shows them to
-- nobody but admins. Hiding them properly would mean a SECURITY DEFINER reader
-- gated on is_admin(), the admin_auth_activity() pattern, if that is ever
-- wanted.
