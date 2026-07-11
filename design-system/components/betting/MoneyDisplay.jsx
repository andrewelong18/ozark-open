import React from "react";

function fmt(value, cents) {
  const n = Math.abs(value);
  return cents
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(n).toLocaleString("en-US");
}

/**
 * Consistent money treatment. Whole dollars for stakes/entries, cents for
 * computed payouts. `pl` colors the sign (green up / red down) for profit/loss.
 * Set `onDark` when placed on an indigo/dark surface so the P/L colors switch
 * to their accessible light variants.
 */
export function MoneyDisplay({
  value,
  cents = false,
  pl = false,
  onDark = false,
  size = "md",
  weight = "bold",
  style = {},
}) {
  const negative = value < 0;
  const sign = pl ? (negative ? "−" : value > 0 ? "+" : "") : negative ? "−" : "";
  const up = onDark ? "var(--money-up-on-dark)" : "var(--money-up)";
  const down = onDark ? "var(--money-down-on-dark)" : "var(--money-down)";
  const flat = onDark ? "var(--indigo-200)" : "var(--money-flat)";
  const color = pl
    ? negative ? down : value > 0 ? up : flat
    : "inherit";
  const fs = { xs: "var(--text-xs)", sm: "var(--text-sm)", md: "var(--text-base)", lg: "var(--text-xl)", xl: "var(--text-3xl)" }[size];
  const fw = { regular: "var(--fw-regular)", medium: "var(--fw-medium)", semibold: "var(--fw-semibold)", bold: "var(--fw-bold)" }[weight];

  return (
    <span
      style={{
        fontFamily: "var(--font-number)",
        fontVariantNumeric: "tabular-nums",
        fontFeatureSettings: "var(--numeric-tabular)",
        fontSize: fs,
        fontWeight: fw,
        color,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {sign}${fmt(value, cents)}
    </span>
  );
}
