import React from "react";

function toFractional(odds) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  if (odds > 0) { const g = gcd(odds, 100); return `${odds / g}-${100 / g}`; }
  const abs = Math.abs(odds); const g = gcd(100, abs); return `${100 / g}-${abs / g}`;
}
function toImplied(odds) {
  const p = odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
  return `${(p * 100).toFixed(1)}%`;
}

/**
 * The primary betting token: American odds (+150 / -130). Positive reads
 * fairway-green, negative reads ink. `detail` reveals fractional + implied.
 */
export function OddsChip({ odds, size = "md", detail = false, style = {} }) {
  const positive = odds > 0;
  const label = positive ? `+${odds}` : `${odds}`;
  const h = size === "sm" ? 24 : size === "lg" ? 36 : 30;
  const fs = size === "sm" ? "var(--text-sm)" : size === "lg" ? "var(--text-lg)" : "var(--text-base)";

  const chip = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: h + 12,
        height: h,
        padding: "0 10px",
        background: positive ? "var(--odds-positive-surface)" : "var(--odds-negative-surface)",
        color: positive ? "var(--odds-positive)" : "var(--odds-negative)",
        border: `1px solid ${positive ? "var(--win-border)" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-number)",
        fontFeatureSettings: "var(--numeric-tabular)",
        fontVariantNumeric: "tabular-nums",
        fontSize: fs,
        fontWeight: "var(--fw-bold)",
        letterSpacing: "0.01em",
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );

  if (!detail) return <span style={style}>{chip}</span>;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, ...style }}>
      {chip}
      <span style={{
        display: "inline-flex", flexDirection: "column", lineHeight: 1.2,
        fontFamily: "var(--font-number)", fontVariantNumeric: "tabular-nums",
        fontSize: "var(--text-2xs)", color: "var(--text-muted)",
      }}>
        <span>{toFractional(odds)}</span>
        <span>{toImplied(odds)}</span>
      </span>
    </span>
  );
}
