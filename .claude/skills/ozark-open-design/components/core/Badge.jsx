import React from "react";

const TONES = {
  neutral: { bg: "var(--neutral-surface)", fg: "var(--ink-700)", bd: "var(--neutral-border)" },
  indigo:  { bg: "var(--indigo-50)", fg: "var(--indigo-700)", bd: "var(--indigo-100)" },
  gold:    { bg: "var(--gold-100)", fg: "var(--gold-700)", bd: "var(--gold-200)" },
  green:   { bg: "var(--win-surface)", fg: "var(--win-strong)", bd: "var(--win-border)" },
  red:     { bg: "var(--loss-surface)", fg: "var(--loss-strong)", bd: "var(--loss-border)" },
  amber:   { bg: "var(--caution-surface)", fg: "var(--caution-strong)", bd: "var(--caution-border)" },
  solid:   { bg: "var(--primary)", fg: "var(--primary-foreground)", bd: "transparent" },
};

/** Generic pill badge. Prefer the semantic StatusBadge/OutcomeBadge for bet states. */
export function Badge({ tone = "neutral", icon = null, uppercase = false, style = {}, children, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 22,
        padding: "0 9px",
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        borderRadius: "var(--radius-pill)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--fw-semibold)",
        textTransform: uppercase ? "uppercase" : "none",
        letterSpacing: uppercase ? "var(--tracking-wide)" : "0.01em",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
