import React from "react";

/**
 * Text / email / number input tuned for the sportsbook. 44px tall,
 * warm hairline border, indigo focus ring. Supports leading/trailing adornments.
 */
export function Input({
  size = "md",
  invalid = false,
  disabled = false,
  leading = null,
  trailing = null,
  style = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const h = size === "sm" ? 36 : size === "lg" ? 52 : 44;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: h,
        padding: "0 12px",
        background: disabled ? "var(--surface-sunken)" : "var(--surface-card)",
        border: `1px solid ${invalid ? "var(--loss)" : focus ? "var(--ring)" : "var(--border)"}`,
        borderRadius: "var(--radius-md)",
        boxShadow: focus ? "var(--shadow-focus)" : "none",
        transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {leading && <span style={{ color: "var(--text-muted)", display: "inline-flex" }}>{leading}</span>}
      <input
        disabled={disabled}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-base)",
          color: "var(--text-body)",
          ...style,
        }}
        {...rest}
      />
      {trailing && <span style={{ color: "var(--text-muted)", display: "inline-flex" }}>{trailing}</span>}
    </div>
  );
}
