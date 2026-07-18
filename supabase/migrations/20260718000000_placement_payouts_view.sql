-- placement_payouts_view (Sprint 7, DATA_MODEL §4): each live placement's
-- theoretical payout, computed from the odds_at_placement snapshot (PRD §7.1)
-- and the pick's uploaded result — never from bet_picks.american_odds, which
-- a re-upload may have repriced since.
--
-- Void ≠ push (ADR 0001 §9): a push credits the stake as theoretical payout;
-- a void contributes 0 and surfaces the stake in refunded_stake so the
-- pari-mutuel pool can shrink (lib/payouts.ts subtracts it from the pool).
--
-- security_invoker: without it a Supabase view runs with its owner's rights
-- and would bypass the bet_placements RLS, showing every bettor's open-phase
-- wagers to everyone. With it, callers see exactly what the table's policies
-- allow — own rows, everyone's rows once the bet closes, admins everything.
-- Soft-deleted rows are excluded here because the own-rows policy
-- deliberately doesn't filter deleted_at (see 20260717000001).
CREATE VIEW public.placement_payouts_view
WITH (security_invoker = on) AS
SELECT
    p.id                 AS placement_id,
    p.user_id,
    pk.id                AS pick_id,
    pk.bet_id,
    p.amount,
    pk.result,
    p.odds_at_placement,
    b.tournament_id,
    CASE
        WHEN pk.result = 'hit' AND p.odds_at_placement > 0
            THEN p.amount + (p.amount * p.odds_at_placement / 100.0)
        WHEN pk.result = 'hit' AND p.odds_at_placement < 0
            THEN p.amount + (p.amount * 100.0 / ABS(p.odds_at_placement))
        WHEN pk.result = 'push'
            THEN p.amount
        WHEN pk.result IN ('miss', 'void')
            THEN 0
        WHEN pk.result = 'pending'
            THEN NULL  -- not yet resolved
    END AS theoretical_payout,
    CASE
        WHEN pk.result = 'void' THEN p.amount
        ELSE 0
    END AS refunded_stake
FROM public.bet_placements p
JOIN public.bet_picks pk ON pk.id = p.pick_id
JOIN public.bets b       ON b.id  = pk.bet_id
WHERE p.deleted_at IS NULL;
