/* Leaderboard — golf standings mirrored from the scoring sheet. Familiar conventions. */
function Leaderboard() {
  const { Card, Badge } = window.DesignSystem_d43214;
  const rows = window.OZ.leaderboard;
  const scoreColor = (s) => (s.startsWith("-") ? "var(--money-up)" : s === "E" ? "var(--text-muted)" : "var(--money-down)");

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--text-strong)" }}>Leaderboard</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>Round 3 · stroke play</div>
        </div>
        <Badge tone="indigo">From scoring sheet</Badge>
      </div>

      <Card padding={false}>
        <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 56px 56px 56px", gap: 8, padding: "10px 16px",
          borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
          <span>Pos</span><span>Player</span><span style={{ textAlign: "center" }}>Thru</span><span style={{ textAlign: "right" }}>Today</span><span style={{ textAlign: "right" }}>Total</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.name} style={{ display: "grid", gridTemplateColumns: "48px 1fr 56px 56px 56px", gap: 8, padding: "13px 16px",
            alignItems: "center", borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border)",
            background: i === 0 ? "var(--indigo-50)" : "transparent" }}>
            <span style={{ fontFamily: "var(--font-number)", fontVariantNumeric: "tabular-nums", fontWeight: 700,
              color: i === 0 ? "var(--indigo-700)" : "var(--text-body)" }}>{r.pos}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>{r.name}</span>
            <span style={{ textAlign: "center", fontFamily: "var(--font-number)", fontVariantNumeric: "tabular-nums", fontSize: 13, color: "var(--text-muted)" }}>{r.thru}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--font-number)", fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 600, color: scoreColor(r.today) }}>{r.today}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--font-number)", fontVariantNumeric: "tabular-nums", fontSize: 14, fontWeight: 700, color: scoreColor(r.total) }}>{r.total}</span>
          </div>
        ))}
      </Card>
      <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
        Scoring, skins & placement money live in the tournament workbook — shown here read-only.
      </p>
    </div>
  );
}
window.Leaderboard = Leaderboard;
