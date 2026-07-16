import React from "react";

/**
 * Inline whole-dollar stake input for an open bet row. States:
 * unplaced (empty), placed (confirmed — gold flash), error (over max / invalid).
 * Whole dollars only. `onPlace` fires on Enter or the check button.
 */
export function StakeInput({
  value = "",
  max = null,
  placed = false,
  error = null,
  disabled = false,
  onChange = () => {},
  onPlace = () => {},
  style = {},
}) {
  const [focus, setFocus] = React.useState(false);
  const [flash, setFlash] = React.useState(false);

  React.useEffect(() => {
    if (placed) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    }
  }, [placed, value]);

  const borderColor = error ? "var(--loss)" : placed ? "var(--win)" : focus ? "var(--ring)" : "var(--border-strong)";

  const handle = (e) => {
    const digits = e.target.value.replace(/[^0-9]/g, "");
    onChange(digits);
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 3, ...style }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 40,
          width: 108,
          padding: "0 4px 0 10px",
          background: disabled ? "var(--surface-sunken)" : "var(--surface-card)",
          border: `1.5px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          boxShadow: flash ? "var(--shadow-gold)" : focus ? "var(--shadow-focus)" : "none",
          transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-base) var(--ease-out)",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{
          fontFamily: "var(--font-number)", fontWeight: "var(--fw-semibold)",
          color: value ? "var(--text-body)" : "var(--text-muted)", fontSize: "var(--text-base)",
        }}>$</span>
        <input
          inputMode="numeric"
          value={value}
          placeholder="0"
          disabled={disabled}
          onChange={handle}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onKeyDown={(e) => { if (e.key === "Enter") onPlace(); }}
          style={{
            flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
            fontFamily: "var(--font-number)", fontVariantNumeric: "tabular-nums",
            fontSize: "var(--text-base)", fontWeight: "var(--fw-semibold)",
            color: "var(--text-body)", textAlign: "left",
          }}
        />
        <button
          type="button"
          onClick={onPlace}
          disabled={disabled || !value}
          aria-label="Place stake"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, flexShrink: 0, border: "none", borderRadius: "var(--radius-sm)",
            cursor: disabled || !value ? "default" : "pointer",
            background: placed ? "var(--win)" : value ? "var(--primary)" : "var(--surface-sunken)",
            color: placed || value ? "#fff" : "var(--text-muted)",
            transition: "background var(--dur-fast) var(--ease-standard)",
            fontSize: 15, fontWeight: 700, lineHeight: 1,
          }}
        >
          {placed ? "✓" : "↵"}
        </button>
      </div>
      {error && (
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-2xs)", color: "var(--loss)", fontWeight: "var(--fw-medium)" }}>
          {error}
        </span>
      )}
      {!error && placed && (
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-2xs)", color: "var(--win-strong)", fontWeight: "var(--fw-semibold)" }}>
          Bet placed
        </span>
      )}
    </div>
  );
}
