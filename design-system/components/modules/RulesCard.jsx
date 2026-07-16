import React from "react";
import { MoneyDisplay } from "../betting/MoneyDisplay.jsx";

/**
 * Personalized rules reference card — entry fee, max single/self bet, bet
 * counts. Reference-card energy (clean rows), not legal-terms energy.
 */
export function RulesCard({
  entryFee = 40,
  maxSingle = 20,
  maxSelf = 10,
  minBets = 5,
  maxBets = 10,
  style = {},
}) {
  const rows = [
    { label: "Entry fee", node: <MoneyDisplay value={entryFee} size="sm" weight="bold" /> },
    { label: "Max single bet", node: <MoneyDisplay value={maxSingle} size="sm" weight="bold" /> },
    { label: "Max bet on yourself", node: <MoneyDisplay value={maxSelf} size="sm" weight="bold" /> },
    { label: "Bets per round", node: `${minBets}–${maxBets}` },
    { label: "Total must equal", node: <MoneyDisplay value={entryFee} size="sm" weight="bold" /> },
  ];

  return (
    <div style={{
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-sm)",
      ...style,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 16px", background: "var(--indigo-50)",
        borderBottom: "1px solid var(--indigo-100)",
      }}>
        <span aria-hidden="true" style={{ fontSize: 15 }}>⛳</span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)", color: "var(--indigo-800)" }}>Your House Rules</span>
      </div>
      <div>
        {rows.map((r, i) => (
          <div key={r.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "11px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border)",
          }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{r.label}</span>
            <span style={{ fontFamily: "var(--font-number)", fontSize: "var(--text-sm)", fontWeight: "var(--fw-semibold)", color: "var(--text-strong)" }}>{r.node}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
