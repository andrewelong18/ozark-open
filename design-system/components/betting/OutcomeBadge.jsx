import React from "react";

/* Outcome triad+void. hit=win green, miss=loss red, push/void=neutral.
   Always pairs color with a glyph + label so it survives a 25-row table. */
const OUTCOME = {
  hit:  { label: "Hit",  glyph: "✓", fg: "var(--win-strong)",  bg: "var(--win-surface)",     bd: "var(--win-border)" },
  miss: { label: "Miss", glyph: "✕", fg: "var(--loss-strong)", bg: "var(--loss-surface)",    bd: "var(--loss-border)" },
  push: { label: "Push", glyph: "=", fg: "var(--ink-700)",     bg: "var(--neutral-surface)", bd: "var(--neutral-border)" },
  void: { label: "Void", glyph: "∅", fg: "var(--ink-700)",     bg: "var(--neutral-surface)", bd: "var(--neutral-border)" },
};

/** Bet outcome badge — hit / miss / push / void. Color + glyph + label. */
export function OutcomeBadge({ outcome = "hit", size = "md", style = {} }) {
  const o = OUTCOME[outcome] || OUTCOME.hit;
  const h = size === "sm" ? 20 : 24;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: h,
        padding: "0 9px",
        background: o.bg,
        color: o.fg,
        border: `1px solid ${o.bd}`,
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-sans)",
        fontSize: size === "sm" ? "var(--text-2xs)" : "var(--text-xs)",
        fontWeight: "var(--fw-bold)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: "1.05em", lineHeight: 1 }} aria-hidden="true">{o.glyph}</span>
      {o.label}
    </span>
  );
}
