/* Dashboard — glanceable stat cards, rules reference, budget snapshot. */
function Dashboard({ onNavigate }) {
  const { StatCard, RulesCard, BudgetModule, Card, Badge, Button } = window.DesignSystem_d43214;
  const t = window.OZ.tournament, me = window.OZ.me;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--text-strong)", lineHeight: 1.1 }}>{t.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{t.dates}</div>
        </div>
        <Badge tone="green" uppercase>Betting Open</Badge>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <StatCard label="Pool Total" value={t.poolTotal} money feature caption={`${t.players} players in`} />
        </div>
        <StatCard label="Your Entry" value={me.entryFee} money />
        <StatCard label="Payout So Far" value={26.31} money cents caption="Theoretical" />
      </div>

      <Card padding={16}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--text-strong)" }}>Round 1 Budget</div>
          <Button variant="gold" size="sm" onClick={() => onNavigate("Bets")}>Place Bets →</Button>
        </div>
        <BudgetModule wagered={23} entryFee={me.entryFee} betCount={3} minBets={me.minBets} maxBets={me.maxBets} />
      </Card>

      <RulesCard entryFee={me.entryFee} maxSingle={me.maxSingle} maxSelf={me.maxSelf} minBets={me.minBets} maxBets={me.maxBets} />
    </div>
  );
}
window.Dashboard = Dashboard;
