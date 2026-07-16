/* Results — final standings. Celebratory but legible; the screenshot people share. */
function Results() {
  const { MoneyDisplay, Card, Badge } = window.DesignSystem_d43214;
  const rows = window.OZ.results.slice().sort((a, b) => b.actual - a.actual);
  const pool = window.OZ.tournament.poolTotal;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--text-strong)" }}>Results</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>Final pari-mutuel shares</div>
        </div>
        <Badge tone="gold" uppercase>Pool ${pool}</Badge>
      </div>

      {/* Winner spotlight */}
      <div style={{ background: "var(--surface-inverse)", borderRadius: "var(--radius-lg)", padding: "18px 20px", boxShadow: "var(--shadow-md)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gold-300)" }}>Top Payout</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "#fff", lineHeight: 1.1, marginTop: 2 }}>{rows[0].name}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <MoneyDisplay value={rows[0].actual} cents size="xl" style={{ color: "var(--gold-400)" }} />
          <div style={{ marginTop: 2 }}><MoneyDisplay value={rows[0].pl} cents pl onDark size="sm" /></div>
        </div>
      </div>

      <Card padding={false}>
        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 78px 78px 66px", gap: 8, padding: "10px 16px",
          borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
          <span>#</span><span>Player</span><span style={{ textAlign: "right" }}>Entry</span><span style={{ textAlign: "right" }}>Payout</span><span style={{ textAlign: "right" }}>P/L</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.name} style={{ display: "grid", gridTemplateColumns: "28px 1fr 78px 78px 66px", gap: 8, padding: "12px 16px",
            alignItems: "center", borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border)",
            background: i === 0 ? "var(--gold-100)" : "transparent" }}>
            <span style={{ fontFamily: "var(--font-number)", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: i === 0 ? "var(--gold-700)" : "var(--text-muted)" }}>{i + 1}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>{r.name}</span>
            <span style={{ textAlign: "right" }}><MoneyDisplay value={r.entry} size="sm" weight="regular" style={{ color: "var(--text-muted)" }} /></span>
            <span style={{ textAlign: "right" }}><MoneyDisplay value={r.actual} cents size="sm" weight="bold" /></span>
            <span style={{ textAlign: "right" }}><MoneyDisplay value={r.pl} cents pl size="sm" weight="semibold" /></span>
          </div>
        ))}
      </Card>
      <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
        Actual share = your theoretical payout ÷ everyone's theoretical × the ${pool} pool.
      </p>
    </div>
  );
}
window.Results = Results;
