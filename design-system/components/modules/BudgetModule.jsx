import React from "react";
import { MoneyDisplay } from "../betting/MoneyDisplay.jsx";

/**
 * "Wagered $X of $Y" budget module with a progress bar and 5-bet-minimum
 * indicator. Turns amber when over-committed, green when exactly balanced.
 */
export function BudgetModule({
  wagered = 0,
  entryFee = 40,
  betCount = 0,
  minBets = 5,
  maxBets = 10,
  compact = false,
  style = {},
}) {
  const pct = Math.min(100, entryFee ? (wagered / entryFee) * 100 : 0);
  const over = wagered > entryFee;
  const exact = wagered === entryFee && betCount >= minBets;
  const remaining = entryFee - wagered;

  const barColor = over ? "var(--caution)" : exact ? "var(--win)" : "var(--primary)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 12, ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", fontWeight: "var(--fw-semibold)", color: "var(--text-body)" }}>
          Wagered
        </span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          <MoneyDisplay value={wagered} size="sm" /> of <MoneyDisplay value={entryFee} size="sm" weight="semibold" />
        </span>
      </div>

      <div style={{ height: 10, borderRadius: "var(--radius-pill)", background: "var(--surface-sunken)", overflow: "hidden", border: "1px solid var(--border)" }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: barColor,
          borderRadius: "var(--radius-pill)",
          transition: "width var(--dur-slow) var(--ease-out), background var(--dur-base) var(--ease-standard)",
        }} />
      </div>

      {!compact && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            {betCount}/{minBets} min bets · {maxBets} max
          </span>
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", fontWeight: "var(--fw-semibold)",
            color: over ? "var(--caution-strong)" : exact ? "var(--win-strong)" : "var(--text-muted)",
          }}>
            {over ? <>Over by <MoneyDisplay value={-remaining} size="xs" style={{ color: "inherit" }} /></>
              : exact ? "Balanced ✓"
              : <><MoneyDisplay value={remaining} size="xs" style={{ color: "inherit" }} /> left</>}
          </span>
        </div>
      )}
    </div>
  );
}
