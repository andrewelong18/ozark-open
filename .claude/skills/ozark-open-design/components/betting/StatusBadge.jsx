import React from "react";

/* Status: bet lifecycle. Draft is never shown. Open = inviting green,
   closed = neutral, resolved = quiet indigo. Color is paired with a label. */
const STATUS = {
  open:     { label: "Open",     fg: "var(--status-open)",     bg: "var(--status-open-surface)",     bd: "var(--status-open-border)",     dot: "var(--green-600)" },
  closed:   { label: "Closed",   fg: "var(--status-closed)",   bg: "var(--status-closed-surface)",   bd: "var(--status-closed-border)",   dot: "var(--ink-400)" },
  resolved: { label: "Resolved", fg: "var(--status-resolved)", bg: "var(--status-resolved-surface)", bd: "var(--status-resolved-border)", dot: "var(--indigo-500)" },
};

/** Bet lifecycle badge — open / closed / resolved. */
export function StatusBadge({ status = "open", style = {} }) {
  const s = STATUS[status] || STATUS.open;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 9px 0 8px",
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.bd}`,
        borderRadius: "var(--radius-pill)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--fw-semibold)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
      {s.label}
    </span>
  );
}
