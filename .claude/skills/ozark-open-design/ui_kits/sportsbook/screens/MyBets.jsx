/* My Bets — placements by round, running total vs entry, per-bet theoretical payout. */
function MyBets() {
  const { BetRow, MoneyDisplay, OutcomeBadge, OddsChip, Card, ComplianceBanner, StatCard } = window.DesignSystem_d43214;
  const me = window.OZ.me;
  const bets = window.OZ.myBets;

  const theo = (b) => {
    if (b.status !== "resolved") return null;
    if (b.outcome === "hit") return b.odds > 0 ? b.stake * (b.odds / 100) + b.stake : b.stake * (100 / Math.abs(b.odds)) + b.stake;
    if (b.outcome === "push" || b.outcome === "void") return b.stake;
    return 0;
  };

  const r1 = bets.filter((b) => b.round === 1);
  const r2 = bets.filter((b) => b.round === 2);
  const wagered = bets.reduce((s, b) => s + b.stake, 0);
  const payout = bets.reduce((s, b) => s + (theo(b) || 0), 0);

  const ResolvedRow = ({ b }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontFamily: "var(--font-number)", fontVariantNumeric: "tabular-nums", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", minWidth: 22 }}>#{b.n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-strong)", lineHeight: 1.3 }}>{b.desc}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <OddsChip odds={b.odds} size="sm" />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Stake <MoneyDisplay value={b.stake} size="xs" weight="semibold" /></span>
        </div>
      </div>
      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <OutcomeBadge outcome={b.outcome} />
        <MoneyDisplay value={theo(b)} cents size="sm" weight="bold" style={{ color: b.outcome === "hit" ? "var(--money-up)" : "var(--text-body)" }} />
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--text-strong)" }}>My Bets</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <StatCard label="Total Wagered" value={wagered} money caption={`of $${me.entryFee} entry`} />
        <StatCard label="Theoretical Payout" value={payout} money cents caption="So far" />
      </div>

      <ComplianceBanner tone="success" title="Round 1 balanced">
        You've wagered your full ${me.entryFee} across {r1.length} open bets. You're locked in — good luck.
      </ComplianceBanner>

      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--indigo-700)", marginBottom: 8 }}>Round 1 · Open</div>
        <Card padding={false}>
          {r1.map((b) => (
            <BetRow key={b.n} number={b.n} description={b.desc} odds={b.odds} status="closed" placed stake={String(b.stake)} />
          ))}
        </Card>
      </div>

      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--indigo-700)", marginBottom: 8 }}>Round 2 · Resolved</div>
        <Card padding={false}>
          {r2.map((b) => <ResolvedRow key={b.n} b={b} />)}
        </Card>
      </div>
    </div>
  );
}
window.MyBets = MyBets;
