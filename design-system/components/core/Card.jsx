import React from "react";

/**
 * Card surface — white, soft ring + shadow, 14px radius. The clubhouse
 * "reference card" container used across dashboard, rules, results.
 */
export function Card({ elevated = false, accent = false, padding = 20, style = {}, children, ...rest }) {
  return (
    <div
      style={{
        position: "relative",
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: elevated ? "var(--shadow-md)" : "var(--shadow-sm)",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      {accent && (
        <div
          aria-hidden="true"
          style={{
            height: 10,
            backgroundColor: "var(--accent)",
            backgroundImage:
              "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--accent) 82%, #000) 0 7px, var(--accent) 7px 14px)",
            borderBottom: "1px solid color-mix(in srgb, var(--accent) 70%, #000)",
            boxShadow: "inset 0 -3px 5px -3px rgba(0,0,0,0.35)",
          }}
        />
      )}
      {typeof padding === "number" || typeof padding === "string"
        ? <div style={{ padding }}>{children}</div>
        : children}
    </div>
  );
}

/** Optional header row for a Card: title + optional trailing slot. */
export function CardHeader({ title, subtitle, action, style = {} }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, ...style }}>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", color: "var(--text-strong)", lineHeight: 1.15 }}>{title}</div>
        {subtitle && <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 3 }}>{subtitle}</div>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
