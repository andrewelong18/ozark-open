/* Bet Menu — the core screen. Round 1 open bets by category with inline
   stake inputs; a sticky budget summary + compliance banner track the total. */
function BetMenu() {
  const { BetRow, BudgetModule, ComplianceBanner, Card, StatusBadge } = window.DesignSystem_d43214;
  const me = window.OZ.me;
  const round = window.OZ.rounds[0];

  const [stakes, setStakes] = React.useState({ 4: "8", 7: "5", 10: "10" });
  const [placed, setPlaced] = React.useState({ 4: true, 7: true, 10: true });

  const wagered = Object.values(stakes).reduce((s, v) => s + (Number(v) || 0), 0);
  const betCount = Object.keys(stakes).filter((k) => Number(stakes[k]) > 0).length;

  const setStake = (n, v) => { setStakes((s) => ({ ...s, [n]: v })); setPlaced((p) => ({ ...p, [n]: false })); };
  const place = (n) => { if (Number(stakes[n]) > 0) setPlaced((p) => ({ ...p, [n]: true })); };
  const errFor = (n) => (Number(stakes[n]) > me.maxSingle ? `Max $${me.maxSingle} single bet` : null);

  const over = wagered > me.entryFee;
  const exact = wagered === me.entryFee && betCount >= me.minBets;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--text-strong)" }}>Bet Menu</div>
        <StatusBadge status="open" />
      </div>

      {/* Sticky budget + compliance */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--background)", paddingBottom: 12, marginBottom: 4 }}>
        <Card padding={14} elevated>
          <BudgetModule wagered={wagered} entryFee={me.entryFee} betCount={betCount} minBets={me.minBets} maxBets={me.maxBets} />
        </Card>
        {!exact && (
          <div style={{ marginTop: 10 }}>
            <ComplianceBanner tone={over ? "warning" : "info"} title={over ? "Over your entry" : "Not balanced yet"}>
              {over
                ? <>You're ${wagered - me.entryFee} over your ${me.entryFee} entry. Trim a stake — total must match exactly.</>
                : <>You've wagered ${wagered} of ${me.entryFee} across {betCount} bets. {betCount < me.minBets ? `Place at least ${me.minBets - betCount} more` : "Balance to your exact entry"}.</>}
            </ComplianceBanner>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 12 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--indigo-700)" }}>Round {round.round}</div>
        {round.categories.map((cat) => (
          <div key={cat.name}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--text-muted)", marginBottom: 8 }}>{cat.name}</div>
            <Card padding={false}>
              {cat.bets.map((b) => (
                <BetRow key={b.n} number={b.n} description={b.desc} odds={b.odds} status="open"
                  stake={stakes[b.n] || ""} placed={!!placed[b.n]} stakeError={errFor(b.n)}
                  onStakeChange={(v) => setStake(b.n, v)} onPlace={() => place(b.n)} />
              ))}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
window.BetMenu = BetMenu;
