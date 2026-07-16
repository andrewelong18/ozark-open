import React from "react";
import { MoneyDisplay } from "../betting/MoneyDisplay.jsx";

/**
 * Dashboard stat tile — a glanceable label + big number. Optionally money
 * (whole or cents) and a caption. `feature` gives the pool-total tile
 * the indigo clubhouse treatment.
 */
export function StatCard({
  label,
  value,
  money = false,
  cents = false,
  caption = null,
  feature = false,
  style = {},
}) {
  const dark = feature;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "16px 18px",
        minWidth: 0,
        background: dark ? "var(--surface-inverse)" : "var(--surface-card)",
        border: `1px solid ${dark ? "transparent" : "var(--border)"}`,
        borderRadius: "var(--radius-lg)",
        boxShadow: dark ? "var(--shadow-md)" : "var(--shadow-sm)",
        ...style,
      }}
    >
      <span style={{
        fontFamily: "var(--font-sans)", fontSize: "var(--text-2xs)",
        fontWeight: "var(--fw-bold)", textTransform: "uppercase",
        letterSpacing: "var(--tracking-wider)",
        color: dark ? "var(--gold-300)" : "var(--text-muted)",
      }}>{label}</span>
      <span style={{
        fontFamily: "var(--font-number)", fontVariantNumeric: "tabular-nums",
        fontSize: "var(--text-3xl)", fontWeight: "var(--fw-bold)", lineHeight: 1,
        color: dark ? "#fff" : "var(--text-strong)",
      }}>
        {money ? <MoneyDisplay value={value} cents={cents} size="xl" style={{ color: "inherit" }} /> : value}
      </span>
      {caption && (
        <span style={{
          fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)",
          color: dark ? "var(--indigo-200)" : "var(--text-muted)",
        }}>{caption}</span>
      )}
    </div>
  );
}
