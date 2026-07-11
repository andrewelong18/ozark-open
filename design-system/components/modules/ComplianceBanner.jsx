import React from "react";

const TONES = {
  warning: { fg: "var(--caution-strong)", bg: "var(--caution-surface)", bd: "var(--caution-border)", glyph: "!" },
  info:    { fg: "var(--indigo-700)", bg: "var(--indigo-50)", bd: "var(--indigo-100)", glyph: "i" },
  success: { fg: "var(--win-strong)", bg: "var(--win-surface)", bd: "var(--win-border)", glyph: "✓" },
};

/**
 * Compliance banner — "You've wagered $23 of $40…". Firm but friendly;
 * informs without nagging and never blocks browsing.
 */
export function ComplianceBanner({ tone = "warning", title, children, action = null, style = {} }) {
  const t = TONES[tone] || TONES.warning;
  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "12px 14px", background: t.bg,
        border: `1px solid ${t.bd}`, borderRadius: "var(--radius-md)",
        ...style,
      }}
    >
      <span aria-hidden="true" style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: t.fg, color: "#fff", fontFamily: "var(--font-sans)",
        fontWeight: "var(--fw-bold)", fontSize: 13, lineHeight: 1,
      }}>{t.glyph}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", fontWeight: "var(--fw-bold)", color: t.fg, marginBottom: 2 }}>{title}</div>}
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-body)", lineHeight: 1.45 }}>{children}</div>
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
