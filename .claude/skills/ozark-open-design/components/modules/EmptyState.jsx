import React from "react";

/**
 * Empty / waiting state — "No bets published yet", "Round 2 opens Saturday".
 * A good place for a little personality. Centered, quiet, optional action.
 */
export function EmptyState({ glyph = "⛳", title, message = null, action = null, style = {} }) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        gap: 10, padding: "40px 24px",
        background: "var(--surface-card)", border: "1px dashed var(--border-strong)",
        borderRadius: "var(--radius-lg)", ...style,
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--indigo-50)", fontSize: 24,
      }} aria-hidden="true">{glyph}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", color: "var(--text-strong)" }}>{title}</div>
      {message && <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-muted)", maxWidth: 320, lineHeight: 1.5 }}>{message}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
