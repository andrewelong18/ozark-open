import React from "react";

const SIZES = {
  sm: { height: 36, padding: "0 14px", fontSize: "var(--text-sm)" },
  md: { height: 44, padding: "0 20px", fontSize: "var(--text-base)" },
  lg: { height: 52, padding: "0 28px", fontSize: "var(--text-md)" },
};

const VARIANTS = {
  primary: {
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    border: "1px solid transparent",
  },
  gold: {
    background: "var(--accent)",
    color: "var(--accent-foreground)",
    border: "1px solid transparent",
  },
  secondary: {
    background: "var(--surface-card)",
    color: "var(--primary)",
    border: "1px solid var(--border-strong)",
  },
  ghost: {
    background: "transparent",
    color: "var(--primary)",
    border: "1px solid transparent",
  },
  destructive: {
    background: "var(--loss-surface)",
    color: "var(--loss-strong)",
    border: "1px solid var(--loss-border)",
  },
};

/**
 * Ozark Open primary action button. Whole-height (>=44px) touch targets,
 * indigo default with a gold variant reserved for the marquee action.
 */
export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  leadingIcon = null,
  trailingIcon = null,
  children,
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;

  const hoverBg = {
    primary: "var(--primary-hover)",
    gold: "var(--gold-500)",
    secondary: "var(--surface-sunken)",
    ghost: "var(--indigo-50)",
    destructive: "var(--red-100)",
  }[variant];

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: fullWidth ? "100%" : "auto",
        height: s.height,
        padding: s.padding,
        fontFamily: "var(--font-sans)",
        fontSize: s.fontSize,
        fontWeight: "var(--fw-semibold)",
        letterSpacing: "0.01em",
        lineHeight: 1,
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
        transform: active && !disabled ? "translateY(1px)" : "none",
        boxShadow: active ? "none" : "var(--shadow-xs)",
        ...v,
        background: hover && !disabled ? hoverBg : v.background,
        ...style,
      }}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
