/* @ds-bundle: {"format":4,"namespace":"DesignSystem_d43214","components":[{"name":"BetRow","sourcePath":"components/betting/BetRow.jsx"},{"name":"MoneyDisplay","sourcePath":"components/betting/MoneyDisplay.jsx"},{"name":"OddsChip","sourcePath":"components/betting/OddsChip.jsx"},{"name":"OutcomeBadge","sourcePath":"components/betting/OutcomeBadge.jsx"},{"name":"StakeInput","sourcePath":"components/betting/StakeInput.jsx"},{"name":"StatusBadge","sourcePath":"components/betting/StatusBadge.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"CardHeader","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"BudgetModule","sourcePath":"components/modules/BudgetModule.jsx"},{"name":"ComplianceBanner","sourcePath":"components/modules/ComplianceBanner.jsx"},{"name":"EmptyState","sourcePath":"components/modules/EmptyState.jsx"},{"name":"RulesCard","sourcePath":"components/modules/RulesCard.jsx"},{"name":"StatCard","sourcePath":"components/modules/StatCard.jsx"},{"name":"Header","sourcePath":"components/navigation/Header.jsx"}],"sourceHashes":{"components/betting/BetRow.jsx":"e96168b61dfa","components/betting/MoneyDisplay.jsx":"5d4fff9cc682","components/betting/OddsChip.jsx":"fdac65091132","components/betting/OutcomeBadge.jsx":"d7beb9c92390","components/betting/StakeInput.jsx":"44659bd899fa","components/betting/StatusBadge.jsx":"8f93e9155ba7","components/core/Badge.jsx":"b94e23d727d6","components/core/Button.jsx":"ab71ed4fa0d9","components/core/Card.jsx":"e8d0f8d41a78","components/core/Input.jsx":"27def4183035","components/modules/BudgetModule.jsx":"f0ae3e2199fe","components/modules/ComplianceBanner.jsx":"08d873a1d833","components/modules/EmptyState.jsx":"03f9fca0b451","components/modules/RulesCard.jsx":"baef3ebc163a","components/modules/StatCard.jsx":"a8eed4db02f5","components/navigation/Header.jsx":"e64e4a62b97a","ui_kits/sportsbook/App.jsx":"4f794c917814","ui_kits/sportsbook/data.js":"c2832e385668","ui_kits/sportsbook/screens/BetMenu.jsx":"0a8f602616d2","ui_kits/sportsbook/screens/Dashboard.jsx":"ffdf1e2144e9","ui_kits/sportsbook/screens/Leaderboard.jsx":"b245cce0f1cb","ui_kits/sportsbook/screens/Login.jsx":"6b46ae22fbc9","ui_kits/sportsbook/screens/MyBets.jsx":"8e296d0e07d5","ui_kits/sportsbook/screens/Results.jsx":"09d00420645b","ui_kits/sportsbook/tweaks-panel.jsx":"6591467622ed"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_d43214 = window.DesignSystem_d43214 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/betting/MoneyDisplay.jsx
try { (() => {
function fmt(value, cents) {
  const n = Math.abs(value);
  return cents ? n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) : Math.round(n).toLocaleString("en-US");
}

/**
 * Consistent money treatment. Whole dollars for stakes/entries, cents for
 * computed payouts. `pl` colors the sign (green up / red down) for profit/loss.
 * Set `onDark` when placed on an indigo/dark surface so the P/L colors switch
 * to their accessible light variants.
 */
function MoneyDisplay({
  value,
  cents = false,
  pl = false,
  onDark = false,
  size = "md",
  weight = "bold",
  style = {}
}) {
  const negative = value < 0;
  const sign = pl ? negative ? "−" : value > 0 ? "+" : "" : negative ? "−" : "";
  const up = onDark ? "var(--money-up-on-dark)" : "var(--money-up)";
  const down = onDark ? "var(--money-down-on-dark)" : "var(--money-down)";
  const flat = onDark ? "var(--indigo-200)" : "var(--money-flat)";
  const color = pl ? negative ? down : value > 0 ? up : flat : "inherit";
  const fs = {
    xs: "var(--text-xs)",
    sm: "var(--text-sm)",
    md: "var(--text-base)",
    lg: "var(--text-xl)",
    xl: "var(--text-3xl)"
  }[size];
  const fw = {
    regular: "var(--fw-regular)",
    medium: "var(--fw-medium)",
    semibold: "var(--fw-semibold)",
    bold: "var(--fw-bold)"
  }[weight];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontFeatureSettings: "var(--numeric-tabular)",
      fontSize: fs,
      fontWeight: fw,
      color,
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
      ...style
    }
  }, sign, "$", fmt(value, cents));
}
Object.assign(__ds_scope, { MoneyDisplay });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/betting/MoneyDisplay.jsx", error: String((e && e.message) || e) }); }

// components/betting/OddsChip.jsx
try { (() => {
function toFractional(odds) {
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  if (odds > 0) {
    const g = gcd(odds, 100);
    return `${odds / g}-${100 / g}`;
  }
  const abs = Math.abs(odds);
  const g = gcd(100, abs);
  return `${100 / g}-${abs / g}`;
}
function toImplied(odds) {
  const p = odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
  return `${(p * 100).toFixed(1)}%`;
}

/**
 * The primary betting token: American odds (+150 / -130). Positive reads
 * fairway-green, negative reads ink. `detail` reveals fractional + implied.
 */
function OddsChip({
  odds,
  size = "md",
  detail = false,
  style = {}
}) {
  const positive = odds > 0;
  const label = positive ? `+${odds}` : `${odds}`;
  const h = size === "sm" ? 24 : size === "lg" ? 36 : 30;
  const fs = size === "sm" ? "var(--text-sm)" : size === "lg" ? "var(--text-lg)" : "var(--text-base)";
  const chip = /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: h + 12,
      height: h,
      padding: "0 10px",
      background: positive ? "var(--odds-positive-surface)" : "var(--odds-negative-surface)",
      color: positive ? "var(--odds-positive)" : "var(--odds-negative)",
      border: `1px solid ${positive ? "var(--win-border)" : "var(--border)"}`,
      borderRadius: "var(--radius-sm)",
      fontFamily: "var(--font-number)",
      fontFeatureSettings: "var(--numeric-tabular)",
      fontVariantNumeric: "tabular-nums",
      fontSize: fs,
      fontWeight: "var(--fw-bold)",
      letterSpacing: "0.01em",
      lineHeight: 1
    }
  }, label);
  if (!detail) return /*#__PURE__*/React.createElement("span", {
    style: style
  }, chip);
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      ...style
    }
  }, chip, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      flexDirection: "column",
      lineHeight: 1.2,
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontSize: "var(--text-2xs)",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("span", null, toFractional(odds)), /*#__PURE__*/React.createElement("span", null, toImplied(odds))));
}
Object.assign(__ds_scope, { OddsChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/betting/OddsChip.jsx", error: String((e && e.message) || e) }); }

// components/betting/OutcomeBadge.jsx
try { (() => {
/* Outcome triad+void. hit=win green, miss=loss red, push/void=neutral.
   Always pairs color with a glyph + label so it survives a 25-row table. */
const OUTCOME = {
  hit: {
    label: "Hit",
    glyph: "✓",
    fg: "var(--win-strong)",
    bg: "var(--win-surface)",
    bd: "var(--win-border)"
  },
  miss: {
    label: "Miss",
    glyph: "✕",
    fg: "var(--loss-strong)",
    bg: "var(--loss-surface)",
    bd: "var(--loss-border)"
  },
  push: {
    label: "Push",
    glyph: "=",
    fg: "var(--ink-700)",
    bg: "var(--neutral-surface)",
    bd: "var(--neutral-border)"
  },
  void: {
    label: "Void",
    glyph: "∅",
    fg: "var(--ink-700)",
    bg: "var(--neutral-surface)",
    bd: "var(--neutral-border)"
  }
};

/** Bet outcome badge — hit / miss / push / void. Color + glyph + label. */
function OutcomeBadge({
  outcome = "hit",
  size = "md",
  style = {}
}) {
  const o = OUTCOME[outcome] || OUTCOME.hit;
  const h = size === "sm" ? 20 : 24;
  return /*#__PURE__*/React.createElement("span", {
    style: {
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
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: "1.05em",
      lineHeight: 1
    },
    "aria-hidden": "true"
  }, o.glyph), o.label);
}
Object.assign(__ds_scope, { OutcomeBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/betting/OutcomeBadge.jsx", error: String((e && e.message) || e) }); }

// components/betting/StakeInput.jsx
try { (() => {
/**
 * Inline whole-dollar stake input for an open bet row. States:
 * unplaced (empty), placed (confirmed — gold flash), error (over max / invalid).
 * Whole dollars only. `onPlace` fires on Enter or the check button.
 */
function StakeInput({
  value = "",
  max = null,
  placed = false,
  error = null,
  disabled = false,
  onChange = () => {},
  onPlace = () => {},
  style = {}
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
  const handle = e => {
    const digits = e.target.value.replace(/[^0-9]/g, "");
    onChange(digits);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      flexDirection: "column",
      gap: 3,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
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
      opacity: disabled ? 0.6 : 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-number)",
      fontWeight: "var(--fw-semibold)",
      color: value ? "var(--text-body)" : "var(--text-muted)",
      fontSize: "var(--text-base)"
    }
  }, "$"), /*#__PURE__*/React.createElement("input", {
    inputMode: "numeric",
    value: value,
    placeholder: "0",
    disabled: disabled,
    onChange: handle,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    onKeyDown: e => {
      if (e.key === "Enter") onPlace();
    },
    style: {
      flex: 1,
      minWidth: 0,
      border: "none",
      outline: "none",
      background: "transparent",
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontSize: "var(--text-base)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-body)",
      textAlign: "left"
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onPlace,
    disabled: disabled || !value,
    "aria-label": "Place stake",
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 30,
      height: 30,
      flexShrink: 0,
      border: "none",
      borderRadius: "var(--radius-sm)",
      cursor: disabled || !value ? "default" : "pointer",
      background: placed ? "var(--win)" : value ? "var(--primary)" : "var(--surface-sunken)",
      color: placed || value ? "#fff" : "var(--text-muted)",
      transition: "background var(--dur-fast) var(--ease-standard)",
      fontSize: 15,
      fontWeight: 700,
      lineHeight: 1
    }
  }, placed ? "✓" : "↵")), error && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-2xs)",
      color: "var(--loss)",
      fontWeight: "var(--fw-medium)"
    }
  }, error), !error && placed && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-2xs)",
      color: "var(--win-strong)",
      fontWeight: "var(--fw-semibold)"
    }
  }, "Bet placed"));
}
Object.assign(__ds_scope, { StakeInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/betting/StakeInput.jsx", error: String((e && e.message) || e) }); }

// components/betting/StatusBadge.jsx
try { (() => {
/* Status: bet lifecycle. Draft is never shown. Open = inviting green,
   closed = neutral, resolved = quiet indigo. Color is paired with a label. */
const STATUS = {
  open: {
    label: "Open",
    fg: "var(--status-open)",
    bg: "var(--status-open-surface)",
    bd: "var(--status-open-border)",
    dot: "var(--green-600)"
  },
  closed: {
    label: "Closed",
    fg: "var(--status-closed)",
    bg: "var(--status-closed-surface)",
    bd: "var(--status-closed-border)",
    dot: "var(--ink-400)"
  },
  resolved: {
    label: "Resolved",
    fg: "var(--status-resolved)",
    bg: "var(--status-resolved-surface)",
    bd: "var(--status-resolved-border)",
    dot: "var(--indigo-500)"
  }
};

/** Bet lifecycle badge — open / closed / resolved. */
function StatusBadge({
  status = "open",
  style = {}
}) {
  const s = STATUS[status] || STATUS.open;
  return /*#__PURE__*/React.createElement("span", {
    style: {
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
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: s.dot
    }
  }), s.label);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/betting/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/betting/BetRow.jsx
try { (() => {
/**
 * The workhorse bet row. Mobile-first card layout: number + description on top,
 * odds/status/outcome cluster, and a right-hand action zone that adapts to
 * status — StakeInput when open, placed amount when placed, quiet when closed.
 */
function BetRow({
  number,
  description,
  odds,
  status = "open",
  outcome = null,
  oddsDetail = true,
  stake = "",
  placed = false,
  stakeError = null,
  onStakeChange = () => {},
  onPlace = () => {},
  style = {}
}) {
  const isOpen = status === "open";
  const dimmed = status === "closed" && !placed;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      padding: "14px 16px",
      background: placed ? "var(--indigo-50)" : "var(--surface-card)",
      borderBottom: "1px solid var(--border)",
      opacity: dimmed ? 0.72 : 1,
      transition: "background var(--dur-base) var(--ease-standard)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-muted)",
      minWidth: 20
    }
  }, "#", number), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-base)",
      fontWeight: "var(--fw-medium)",
      color: "var(--text-strong)",
      lineHeight: 1.3,
      textWrap: "pretty"
    }
  }, description)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      paddingLeft: 28
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.OddsChip, {
    odds: odds,
    detail: oddsDetail,
    size: "sm"
  }), status !== "open" && /*#__PURE__*/React.createElement(__ds_scope.StatusBadge, {
    status: status
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 6,
      paddingTop: 2
    }
  }, outcome ? /*#__PURE__*/React.createElement(__ds_scope.OutcomeBadge, {
    outcome: outcome
  }) : isOpen ? /*#__PURE__*/React.createElement(__ds_scope.StakeInput, {
    value: stake,
    placed: placed,
    error: stakeError,
    onChange: onStakeChange,
    onPlace: onPlace
  }) : placed ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-2xs)",
      color: "var(--text-muted)",
      fontFamily: "var(--font-sans)",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)"
    }
  }, "Placed"), /*#__PURE__*/React.createElement(__ds_scope.MoneyDisplay, {
    value: Number(stake) || 0,
    size: "md"
  })) : /*#__PURE__*/React.createElement(__ds_scope.StatusBadge, {
    status: status
  })));
}
Object.assign(__ds_scope, { BetRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/betting/BetRow.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  neutral: {
    bg: "var(--neutral-surface)",
    fg: "var(--ink-700)",
    bd: "var(--neutral-border)"
  },
  indigo: {
    bg: "var(--indigo-50)",
    fg: "var(--indigo-700)",
    bd: "var(--indigo-100)"
  },
  gold: {
    bg: "var(--gold-100)",
    fg: "var(--gold-700)",
    bd: "var(--gold-200)"
  },
  green: {
    bg: "var(--win-surface)",
    fg: "var(--win-strong)",
    bd: "var(--win-border)"
  },
  red: {
    bg: "var(--loss-surface)",
    fg: "var(--loss-strong)",
    bd: "var(--loss-border)"
  },
  amber: {
    bg: "var(--caution-surface)",
    fg: "var(--caution-strong)",
    bd: "var(--caution-border)"
  },
  solid: {
    bg: "var(--primary)",
    fg: "var(--primary-foreground)",
    bd: "transparent"
  }
};

/** Generic pill badge. Prefer the semantic StatusBadge/OutcomeBadge for bet states. */
function Badge({
  tone = "neutral",
  icon = null,
  uppercase = false,
  style = {},
  children,
  ...rest
}) {
  const t = TONES[tone] || TONES.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
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
      ...style
    }
  }, rest), icon, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    height: 36,
    padding: "0 14px",
    fontSize: "var(--text-sm)"
  },
  md: {
    height: 44,
    padding: "0 20px",
    fontSize: "var(--text-base)"
  },
  lg: {
    height: 52,
    padding: "0 28px",
    fontSize: "var(--text-md)"
  }
};
const VARIANTS = {
  primary: {
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    border: "1px solid transparent"
  },
  gold: {
    background: "var(--accent)",
    color: "var(--accent-foreground)",
    border: "1px solid transparent"
  },
  secondary: {
    background: "var(--surface-card)",
    color: "var(--primary)",
    border: "1px solid var(--border-strong)"
  },
  ghost: {
    background: "transparent",
    color: "var(--primary)",
    border: "1px solid transparent"
  },
  destructive: {
    background: "var(--loss-surface)",
    color: "var(--loss-strong)",
    border: "1px solid var(--loss-border)"
  }
};

/**
 * Ozark Open primary action button. Whole-height (>=44px) touch targets,
 * indigo default with a gold variant reserved for the marquee action.
 */
function Button({
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
    destructive: "var(--red-100)"
  }[variant];
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    style: {
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
      ...style
    }
  }, rest), leadingIcon, children, trailingIcon);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card surface — white, soft ring + shadow, 14px radius. The clubhouse
 * "reference card" container used across dashboard, rules, results.
 */
function Card({
  elevated = false,
  accent = false,
  padding = 20,
  style = {},
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: "relative",
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      boxShadow: elevated ? "var(--shadow-md)" : "var(--shadow-sm)",
      overflow: "hidden",
      ...style
    }
  }, rest), accent && /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      height: 10,
      backgroundColor: "var(--accent)",
      backgroundImage: "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--accent) 82%, #000) 0 7px, var(--accent) 7px 14px)",
      borderBottom: "1px solid color-mix(in srgb, var(--accent) 70%, #000)",
      boxShadow: "inset 0 -3px 5px -3px rgba(0,0,0,0.35)"
    }
  }), typeof padding === "number" || typeof padding === "string" ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding
    }
  }, children) : children);
}

/** Optional header row for a Card: title + optional trailing slot. */
function CardHeader({
  title,
  subtitle,
  action,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: "var(--text-lg)",
      color: "var(--text-strong)",
      lineHeight: 1.15
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)",
      marginTop: 3
    }
  }, subtitle)), action && /*#__PURE__*/React.createElement("div", null, action));
}
Object.assign(__ds_scope, { Card, CardHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Text / email / number input tuned for the sportsbook. 44px tall,
 * warm hairline border, indigo focus ring. Supports leading/trailing adornments.
 */
function Input({
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
  return /*#__PURE__*/React.createElement("div", {
    style: {
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
      opacity: disabled ? 0.6 : 1
    }
  }, leading && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)",
      display: "inline-flex"
    }
  }, leading), /*#__PURE__*/React.createElement("input", _extends({
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      height: "100%",
      border: "none",
      outline: "none",
      background: "transparent",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-base)",
      color: "var(--text-body)",
      ...style
    }
  }, rest)), trailing && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)",
      display: "inline-flex"
    }
  }, trailing));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/modules/BudgetModule.jsx
try { (() => {
/**
 * "Wagered $X of $Y" budget module with a progress bar and 5-bet-minimum
 * indicator. Turns amber when over-committed, green when exactly balanced.
 */
function BudgetModule({
  wagered = 0,
  entryFee = 40,
  betCount = 0,
  minBets = 5,
  maxBets = 10,
  compact = false,
  style = {}
}) {
  const pct = Math.min(100, entryFee ? wagered / entryFee * 100 : 0);
  const over = wagered > entryFee;
  const exact = wagered === entryFee && betCount >= minBets;
  const remaining = entryFee - wagered;
  const barColor = over ? "var(--caution)" : exact ? "var(--win)" : "var(--primary)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: compact ? 8 : 12,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-body)"
    }
  }, "Wagered"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.MoneyDisplay, {
    value: wagered,
    size: "sm"
  }), " of ", /*#__PURE__*/React.createElement(__ds_scope.MoneyDisplay, {
    value: entryFee,
    size: "sm",
    weight: "semibold"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 10,
      borderRadius: "var(--radius-pill)",
      background: "var(--surface-sunken)",
      overflow: "hidden",
      border: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: "100%",
      background: barColor,
      borderRadius: "var(--radius-pill)",
      transition: "width var(--dur-slow) var(--ease-out), background var(--dur-base) var(--ease-standard)"
    }
  })), !compact && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-xs)",
      color: "var(--text-muted)"
    }
  }, betCount, "/", minBets, " min bets \xB7 ", maxBets, " max"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--fw-semibold)",
      color: over ? "var(--caution-strong)" : exact ? "var(--win-strong)" : "var(--text-muted)"
    }
  }, over ? /*#__PURE__*/React.createElement(React.Fragment, null, "Over by ", /*#__PURE__*/React.createElement(__ds_scope.MoneyDisplay, {
    value: -remaining,
    size: "xs",
    style: {
      color: "inherit"
    }
  })) : exact ? "Balanced ✓" : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(__ds_scope.MoneyDisplay, {
    value: remaining,
    size: "xs",
    style: {
      color: "inherit"
    }
  }), " left"))));
}
Object.assign(__ds_scope, { BudgetModule });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/BudgetModule.jsx", error: String((e && e.message) || e) }); }

// components/modules/ComplianceBanner.jsx
try { (() => {
const TONES = {
  warning: {
    fg: "var(--caution-strong)",
    bg: "var(--caution-surface)",
    bd: "var(--caution-border)",
    glyph: "!"
  },
  info: {
    fg: "var(--indigo-700)",
    bg: "var(--indigo-50)",
    bd: "var(--indigo-100)",
    glyph: "i"
  },
  success: {
    fg: "var(--win-strong)",
    bg: "var(--win-surface)",
    bd: "var(--win-border)",
    glyph: "✓"
  }
};

/**
 * Compliance banner — "You've wagered $23 of $40…". Firm but friendly;
 * informs without nagging and never blocks browsing.
 */
function ComplianceBanner({
  tone = "warning",
  title,
  children,
  action = null,
  style = {}
}) {
  const t = TONES[tone] || TONES.warning;
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      padding: "12px 14px",
      background: t.bg,
      border: `1px solid ${t.bd}`,
      borderRadius: "var(--radius-md)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      flexShrink: 0,
      width: 22,
      height: 22,
      borderRadius: "50%",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: t.fg,
      color: "#fff",
      fontFamily: "var(--font-sans)",
      fontWeight: "var(--fw-bold)",
      fontSize: 13,
      lineHeight: 1
    }
  }, t.glyph), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--fw-bold)",
      color: t.fg,
      marginBottom: 2
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--text-body)",
      lineHeight: 1.45
    }
  }, children)), action && /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0
    }
  }, action));
}
Object.assign(__ds_scope, { ComplianceBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/ComplianceBanner.jsx", error: String((e && e.message) || e) }); }

// components/modules/EmptyState.jsx
try { (() => {
/**
 * Empty / waiting state — "No bets published yet", "Round 2 opens Saturday".
 * A good place for a little personality. Centered, quiet, optional action.
 */
function EmptyState({
  glyph = "⛳",
  title,
  message = null,
  action = null,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: 10,
      padding: "40px 24px",
      background: "var(--surface-card)",
      border: "1px dashed var(--border-strong)",
      borderRadius: "var(--radius-lg)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--indigo-50)",
      fontSize: 24
    },
    "aria-hidden": "true"
  }, glyph), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: "var(--text-lg)",
      color: "var(--text-strong)"
    }
  }, title), message && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)",
      maxWidth: 320,
      lineHeight: 1.5
    }
  }, message), action && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, action));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/modules/RulesCard.jsx
try { (() => {
/**
 * Personalized rules reference card — entry fee, max single/self bet, bet
 * counts. Reference-card energy (clean rows), not legal-terms energy.
 */
function RulesCard({
  entryFee = 40,
  maxSingle = 20,
  maxSelf = 10,
  minBets = 5,
  maxBets = 10,
  style = {}
}) {
  const rows = [{
    label: "Entry fee",
    node: /*#__PURE__*/React.createElement(__ds_scope.MoneyDisplay, {
      value: entryFee,
      size: "sm",
      weight: "bold"
    })
  }, {
    label: "Max single bet",
    node: /*#__PURE__*/React.createElement(__ds_scope.MoneyDisplay, {
      value: maxSingle,
      size: "sm",
      weight: "bold"
    })
  }, {
    label: "Max bet on yourself",
    node: /*#__PURE__*/React.createElement(__ds_scope.MoneyDisplay, {
      value: maxSelf,
      size: "sm",
      weight: "bold"
    })
  }, {
    label: "Bets per round",
    node: `${minBets}–${maxBets}`
  }, {
    label: "Total must equal",
    node: /*#__PURE__*/React.createElement(__ds_scope.MoneyDisplay, {
      value: entryFee,
      size: "sm",
      weight: "bold"
    })
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      boxShadow: "var(--shadow-sm)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "12px 16px",
      background: "var(--indigo-50)",
      borderBottom: "1px solid var(--indigo-100)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontSize: 15
    }
  }, "\u26F3"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: "var(--text-md)",
      color: "var(--indigo-800)"
    }
  }, "Your House Rules")), /*#__PURE__*/React.createElement("div", null, rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r.label,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "11px 16px",
      borderTop: i === 0 ? "none" : "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)"
    }
  }, r.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-number)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-strong)"
    }
  }, r.node)))));
}
Object.assign(__ds_scope, { RulesCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/RulesCard.jsx", error: String((e && e.message) || e) }); }

// components/modules/StatCard.jsx
try { (() => {
/**
 * Dashboard stat tile — a glanceable label + big number. Optionally money
 * (whole or cents) and a caption. `feature` gives the pool-total tile
 * the indigo clubhouse treatment.
 */
function StatCard({
  label,
  value,
  money = false,
  cents = false,
  caption = null,
  feature = false,
  style = {}
}) {
  const dark = feature;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      padding: "16px 18px",
      minWidth: 0,
      background: dark ? "var(--surface-inverse)" : "var(--surface-card)",
      border: `1px solid ${dark ? "transparent" : "var(--border)"}`,
      borderRadius: "var(--radius-lg)",
      boxShadow: dark ? "var(--shadow-md)" : "var(--shadow-sm)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-2xs)",
      fontWeight: "var(--fw-bold)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wider)",
      color: dark ? "var(--gold-300)" : "var(--text-muted)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontSize: "var(--text-3xl)",
      fontWeight: "var(--fw-bold)",
      lineHeight: 1,
      color: dark ? "#fff" : "var(--text-strong)"
    }
  }, money ? /*#__PURE__*/React.createElement(__ds_scope.MoneyDisplay, {
    value: value,
    cents: cents,
    size: "xl",
    style: {
      color: "inherit"
    }
  }) : value), caption && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: dark ? "var(--indigo-200)" : "var(--text-muted)"
    }
  }, caption));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Header.jsx
try { (() => {
/**
 * App header — brand lockup, page nav, and user display name + logout.
 * Mobile-first: nav scrolls horizontally under the brand bar on small screens.
 * Pass `markSrc` to show the golf-flag mark; otherwise the name renders in
 * the Azalea display face.
 */
function Header({
  brand = "Ozark Open Sportsbook",
  markSrc = null,
  nav = ["Dashboard", "Bets", "My Bets", "All Bets", "Results", "Leaderboard"],
  active = "Bets",
  user = null,
  maxWidth = "var(--container-max)",
  navStyle = "pill",
  onNavigate = () => {},
  style = {}
}) {
  const inner = typeof maxWidth === "number" ? maxWidth + "px" : maxWidth;
  const isPill = navStyle !== "underline";
  const [hovered, setHovered] = React.useState(null);
  return /*#__PURE__*/React.createElement("header", {
    style: {
      background: "linear-gradient(180deg, var(--indigo-700) 0%, var(--indigo-800) 100%)",
      color: "var(--text-on-dark)",
      paddingBottom: 6,
      boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.25)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      height: "var(--header-h)",
      padding: "0 16px",
      maxWidth: inner,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
      flex: "1 1 auto"
    }
  }, markSrc && /*#__PURE__*/React.createElement("img", {
    src: markSrc,
    alt: "",
    style: {
      height: 30,
      width: "auto",
      display: "block",
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: "clamp(16px, 4.6vw, var(--text-xl))",
      color: "#fff",
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, brand)), user && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--indigo-200)",
      whiteSpace: "nowrap"
    }
  }, user), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => onNavigate("__logout"),
    style: {
      height: 32,
      padding: "0 12px",
      border: "1px solid rgba(255,255,255,0.25)",
      background: "transparent",
      color: "#fff",
      borderRadius: "var(--radius-sm)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--fw-semibold)",
      cursor: "pointer"
    }
  }, "Log out"))), /*#__PURE__*/React.createElement("nav", {
    style: isPill ? {
      display: "flex",
      gap: 4,
      padding: 6,
      margin: "0 auto 12px",
      maxWidth: inner,
      width: `calc(100% - 32px)`,
      boxSizing: "border-box",
      overflowX: "auto",
      backgroundColor: "var(--indigo-950, #14133a)",
      backgroundImage: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.09) 0 2px, rgba(255,255,255,0) 2px 9px)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: "var(--radius-pill)",
      boxShadow: "var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -6px 12px -8px rgba(0,0,0,0.6)"
    } : {
      display: "flex",
      gap: 2,
      padding: "0 8px",
      margin: "0 auto",
      maxWidth: inner,
      overflowX: "auto",
      backgroundColor: "var(--surface-inverse-2)",
      backgroundImage: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0 2px, rgba(255,255,255,0) 2px 9px)"
    }
  }, nav.map(item => {
    const isActive = item === active;
    const isHover = hovered === item && !isActive;
    const pillStyle = {
      position: "relative",
      flexShrink: 0,
      height: 40,
      padding: "0 17px",
      border: "none",
      backgroundColor: isActive ? "var(--accent)" : isHover ? "rgba(255,255,255,0.08)" : "transparent",
      backgroundImage: "none",
      cursor: "pointer",
      borderRadius: "var(--radius-pill)",
      boxShadow: isActive ? "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 5px -2px rgba(0,0,0,0.45), 0 2px 5px rgba(0,0,0,0.35)" : "none",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      fontWeight: isActive ? "var(--fw-bold)" : "var(--fw-medium)",
      color: isActive ? "var(--accent-foreground)" : isHover ? "#fff" : "var(--indigo-200)",
      textShadow: isActive ? "0 1px 0 rgba(255,255,255,0.35)" : "none",
      transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
      whiteSpace: "nowrap"
    };
    const underlineStyle = {
      position: "relative",
      flexShrink: 0,
      height: 44,
      padding: "0 14px",
      border: "none",
      background: isHover ? "rgba(255,255,255,0.06)" : "transparent",
      cursor: "pointer",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      fontWeight: isActive ? "var(--fw-bold)" : "var(--fw-medium)",
      color: isActive ? "var(--accent)" : isHover ? "#fff" : "var(--indigo-200)",
      borderBottom: `2.5px solid ${isActive ? "var(--accent)" : "transparent"}`,
      whiteSpace: "nowrap"
    };
    return /*#__PURE__*/React.createElement("button", {
      key: item,
      type: "button",
      onClick: () => onNavigate(item),
      onMouseEnter: () => setHovered(item),
      onMouseLeave: () => setHovered(null),
      style: isPill ? pillStyle : underlineStyle
    }, item);
  })));
}
Object.assign(__ds_scope, { Header });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/App.jsx
try { (() => {
/* Root app — auth gate + Header + active screen router, with a Tweaks panel. */
function App() {
  const {
    Header
  } = window.DesignSystem_d43214;
  const {
    useTweaks,
    TweaksPanel,
    TweakSection,
    TweakRadio,
    TweakColor,
    TweakToggle
  } = window;
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "headerWidth": "content",
    "accent": "#fdda00",
    "navStyle": "pill",
    "denseCards": false
  } /*EDITMODE-END*/;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [authed, setAuthed] = React.useState(false);
  const [screen, setScreen] = React.useState("Dashboard");
  const nav = ["Dashboard", "Bets", "My Bets", "All Bets", "Results", "Leaderboard"];
  const onNavigate = p => {
    if (p === "__logout") {
      setAuthed(false);
      setScreen("Dashboard");
      return;
    }
    setScreen(p);
  };
  const screens = {
    Dashboard: /*#__PURE__*/React.createElement(window.Dashboard, {
      onNavigate: onNavigate
    }),
    Bets: /*#__PURE__*/React.createElement(window.BetMenu, null),
    "My Bets": /*#__PURE__*/React.createElement(window.MyBets, null),
    "All Bets": /*#__PURE__*/React.createElement(window.MyBets, null),
    Results: /*#__PURE__*/React.createElement(window.Results, null),
    Leaderboard: /*#__PURE__*/React.createElement(window.Leaderboard, null)
  };

  // Accent tweak overrides the gold role tokens app-wide (nav active pill, gold buttons).
  const wrapStyle = {
    minHeight: "100vh",
    background: "var(--background)",
    "--accent": t.accent,
    "--gold-400": t.accent
  };
  const maxWidth = t.headerWidth === "full" ? 1120 : 640;
  const panel = /*#__PURE__*/React.createElement(TweaksPanel, null, /*#__PURE__*/React.createElement(TweakSection, {
    label: "Header & nav"
  }), /*#__PURE__*/React.createElement(TweakRadio, {
    label: "Header width",
    value: t.headerWidth,
    options: ["content", "full"],
    onChange: v => setTweak("headerWidth", v)
  }), /*#__PURE__*/React.createElement(TweakRadio, {
    label: "Nav style",
    value: t.navStyle,
    options: ["pill", "underline"],
    onChange: v => setTweak("navStyle", v)
  }), /*#__PURE__*/React.createElement(TweakSection, {
    label: "Brand"
  }), /*#__PURE__*/React.createElement(TweakColor, {
    label: "Accent",
    value: t.accent,
    options: ["#fdda00", "#e6c200", "#23a566", "#524fc0"],
    onChange: v => setTweak("accent", v)
  }), /*#__PURE__*/React.createElement(TweakSection, {
    label: "Density"
  }), /*#__PURE__*/React.createElement(TweakToggle, {
    label: "Compact cards",
    value: t.denseCards,
    onChange: v => setTweak("denseCards", v)
  }));
  if (!authed) {
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(window.Login, {
      onLogin: () => setAuthed(true)
    }), panel);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: wrapStyle,
    "data-dense": t.denseCards ? "1" : "0"
  }, /*#__PURE__*/React.createElement(Header, {
    brand: "Ozark Open Sportsbook",
    markSrc: "../../assets/logos/ozark-mark.svg",
    nav: nav,
    active: screen,
    user: window.OZ.me.name,
    maxWidth: maxWidth,
    navStyle: t.navStyle,
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement("div", null, screens[screen]), panel);
}
window.App = App;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/data.js
try { (() => {
/* Fake data for the Ozark Open Sportsbook UI kit. Mirrors the PRD:
   pari-mutuel pool, American odds, two rounds, hit/miss/push/void. */
window.OZ = {
  tournament: {
    name: "Ozark Open 2026",
    dates: "Sep 24–27, 2026",
    status: "active",
    poolTotal: 520,
    players: 24
  },
  me: {
    name: "Jake Kohne",
    entryFee: 40,
    maxSingle: 20,
    maxSelf: 10,
    minBets: 5,
    maxBets: 10
  },
  // Round 1 — open for betting; Round 2 — resolved (post-close social view)
  rounds: [{
    round: 1,
    status: "open",
    categories: [{
      name: "Outright Winner",
      bets: [{
        n: 1,
        desc: "Dan Mercer to win the tournament",
        odds: 450
      }, {
        n: 2,
        desc: "The Field to win",
        odds: -300
      }, {
        n: 3,
        desc: "Steve Rivers to win the tournament",
        odds: 600
      }]
    }, {
      name: "Top-N Finish + Ties",
      bets: [{
        n: 4,
        desc: "Dan Mercer to finish top 4 + ties",
        odds: 150
      }, {
        n: 5,
        desc: "Pat Leicht to finish top 8 + ties",
        odds: -120
      }, {
        n: 6,
        desc: "Andrew Long to finish top 4 + ties",
        odds: 220
      }]
    }, {
      name: "Head-to-Head",
      bets: [{
        n: 7,
        desc: "Kohne beats Leicht (no ties)",
        odds: 120
      }, {
        n: 8,
        desc: "Rivers beats Mercer (void if tied)",
        odds: -110
      }, {
        n: 9,
        desc: "Long best of Kohne/Leicht/Rivers",
        odds: 260
      }]
    }, {
      name: "Props",
      bets: [{
        n: 10,
        desc: "Best ball under 80.5 on Thursday",
        odds: -115
      }, {
        n: 11,
        desc: "Any hole-in-one during Round 1",
        odds: 900
      }]
    }]
  }, {
    round: 2,
    status: "resolved",
    categories: [{
      name: "Outright Winner",
      bets: [{
        n: 12,
        desc: "Dan Mercer to win the tournament",
        odds: 200,
        outcome: "hit"
      }, {
        n: 13,
        desc: "The Field to win",
        odds: -250,
        outcome: "miss"
      }]
    }, {
      name: "Top-N Finish + Ties",
      bets: [{
        n: 14,
        desc: "Pat Leicht to finish top 4 + ties",
        odds: 175,
        outcome: "hit"
      }, {
        n: 15,
        desc: "Andrew Long to finish top 8 + ties",
        odds: -140,
        outcome: "push"
      }]
    }, {
      name: "Head-to-Head",
      bets: [{
        n: 16,
        desc: "Kohne beats Rivers (void if tied)",
        odds: 130,
        outcome: "void"
      }, {
        n: 17,
        desc: "Leicht beats Long (no ties)",
        odds: -105,
        outcome: "miss"
      }]
    }]
  }],
  // "My Bets" — Jake's placements this tournament (running total vs $40 entry)
  myBets: [{
    n: 4,
    desc: "Dan Mercer to finish top 4 + ties",
    odds: 150,
    round: 1,
    stake: 8,
    status: "open"
  }, {
    n: 7,
    desc: "Kohne beats Leicht (no ties)",
    odds: 120,
    round: 1,
    stake: 5,
    status: "open"
  }, {
    n: 10,
    desc: "Best ball under 80.5 on Thursday",
    odds: -115,
    round: 1,
    stake: 10,
    status: "open"
  }, {
    n: 12,
    desc: "Dan Mercer to win the tournament",
    odds: 200,
    round: 2,
    stake: 6,
    status: "resolved",
    outcome: "hit"
  }, {
    n: 14,
    desc: "Pat Leicht to finish top 4 + ties",
    odds: 175,
    round: 2,
    stake: 4,
    status: "resolved",
    outcome: "hit"
  }],
  // Final results / standings (post-tournament share of the pool)
  results: [{
    name: "Dan Mercer",
    entry: 40,
    theo: 61.5,
    actual: 82.4,
    pl: 42.4
  }, {
    name: "Jake Kohne",
    entry: 40,
    theo: 38.9,
    actual: 52.1,
    pl: 12.1
  }, {
    name: "Pat Leicht",
    entry: 30,
    theo: 27.0,
    actual: 36.2,
    pl: 6.2
  }, {
    name: "Steve Rivers",
    entry: 50,
    theo: 33.1,
    actual: 44.3,
    pl: -5.7
  }, {
    name: "Andrew Long",
    entry: 40,
    theo: 22.4,
    actual: 30.0,
    pl: -10.0
  }, {
    name: "Cole Ramsey",
    entry: 20,
    theo: 8.2,
    actual: 11.0,
    pl: -9.0
  }],
  // Leaderboard mirrored from the scoring sheet
  leaderboard: [{
    pos: "1",
    name: "Dan Mercer",
    thru: "F",
    today: "-4",
    total: "-9"
  }, {
    pos: "2",
    name: "Pat Leicht",
    thru: "F",
    today: "-2",
    total: "-6"
  }, {
    pos: "T3",
    name: "Jake Kohne",
    thru: "F",
    today: "-1",
    total: "-4"
  }, {
    pos: "T3",
    name: "Steve Rivers",
    thru: "F",
    today: "+1",
    total: "-4"
  }, {
    pos: "5",
    name: "Andrew Long",
    thru: "F",
    today: "E",
    total: "-2"
  }, {
    pos: "6",
    name: "Cole Ramsey",
    thru: "F",
    today: "+3",
    total: "+5"
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/data.js", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/screens/BetMenu.jsx
try { (() => {
/* Bet Menu — the core screen. Round 1 open bets by category with inline
   stake inputs; a sticky budget summary + compliance banner track the total. */
function BetMenu() {
  const {
    BetRow,
    BudgetModule,
    ComplianceBanner,
    Card,
    StatusBadge
  } = window.DesignSystem_d43214;
  const me = window.OZ.me;
  const round = window.OZ.rounds[0];
  const [stakes, setStakes] = React.useState({
    4: "8",
    7: "5",
    10: "10"
  });
  const [placed, setPlaced] = React.useState({
    4: true,
    7: true,
    10: true
  });
  const wagered = Object.values(stakes).reduce((s, v) => s + (Number(v) || 0), 0);
  const betCount = Object.keys(stakes).filter(k => Number(stakes[k]) > 0).length;
  const setStake = (n, v) => {
    setStakes(s => ({
      ...s,
      [n]: v
    }));
    setPlaced(p => ({
      ...p,
      [n]: false
    }));
  };
  const place = n => {
    if (Number(stakes[n]) > 0) setPlaced(p => ({
      ...p,
      [n]: true
    }));
  };
  const errFor = n => Number(stakes[n]) > me.maxSingle ? `Max $${me.maxSingle} single bet` : null;
  const over = wagered > me.entryFee;
  const exact = wagered === me.entryFee && betCount >= me.minBets;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 640,
      margin: "0 auto",
      padding: "16px 16px 40px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 30,
      color: "var(--text-strong)"
    }
  }, "Bet Menu"), /*#__PURE__*/React.createElement(StatusBadge, {
    status: "open"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 5,
      background: "var(--background)",
      paddingBottom: 12,
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 14,
    elevated: true
  }, /*#__PURE__*/React.createElement(BudgetModule, {
    wagered: wagered,
    entryFee: me.entryFee,
    betCount: betCount,
    minBets: me.minBets,
    maxBets: me.maxBets
  })), !exact && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(ComplianceBanner, {
    tone: over ? "warning" : "info",
    title: over ? "Over your entry" : "Not balanced yet"
  }, over ? /*#__PURE__*/React.createElement(React.Fragment, null, "You're $", wagered - me.entryFee, " over your $", me.entryFee, " entry. Trim a stake \u2014 total must match exactly.") : /*#__PURE__*/React.createElement(React.Fragment, null, "You've wagered $", wagered, " of $", me.entryFee, " across ", betCount, " bets. ", betCount < me.minBets ? `Place at least ${me.minBets - betCount} more` : "Balance to your exact entry", ".")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20,
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 20,
      color: "var(--indigo-700)"
    }
  }, "Round ", round.round), round.categories.map(cat => /*#__PURE__*/React.createElement("div", {
    key: cat.name
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.09em",
      color: "var(--text-muted)",
      marginBottom: 8
    }
  }, cat.name), /*#__PURE__*/React.createElement(Card, {
    padding: false
  }, cat.bets.map(b => /*#__PURE__*/React.createElement(BetRow, {
    key: b.n,
    number: b.n,
    description: b.desc,
    odds: b.odds,
    status: "open",
    stake: stakes[b.n] || "",
    placed: !!placed[b.n],
    stakeError: errFor(b.n),
    onStakeChange: v => setStake(b.n, v),
    onPlace: () => place(b.n)
  })))))));
}
window.BetMenu = BetMenu;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/screens/BetMenu.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/screens/Dashboard.jsx
try { (() => {
/* Dashboard — glanceable stat cards, rules reference, budget snapshot. */
function Dashboard({
  onNavigate
}) {
  const {
    StatCard,
    RulesCard,
    BudgetModule,
    Card,
    Badge,
    Button
  } = window.DesignSystem_d43214;
  const t = window.OZ.tournament,
    me = window.OZ.me;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 640,
      margin: "0 auto",
      padding: "20px 16px 40px",
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 30,
      color: "var(--text-strong)",
      lineHeight: 1.1
    }
  }, t.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)",
      marginTop: 2
    }
  }, t.dates)), /*#__PURE__*/React.createElement(Badge, {
    tone: "green",
    uppercase: true
  }, "Betting Open")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: "1 / -1"
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Pool Total",
    value: t.poolTotal,
    money: true,
    feature: true,
    caption: `${t.players} players in`
  })), /*#__PURE__*/React.createElement(StatCard, {
    label: "Your Entry",
    value: me.entryFee,
    money: true
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Payout So Far",
    value: 26.31,
    money: true,
    cents: true,
    caption: "Theoretical"
  })), /*#__PURE__*/React.createElement(Card, {
    padding: 16
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 18,
      color: "var(--text-strong)"
    }
  }, "Round 1 Budget"), /*#__PURE__*/React.createElement(Button, {
    variant: "gold",
    size: "sm",
    onClick: () => onNavigate("Bets")
  }, "Place Bets \u2192")), /*#__PURE__*/React.createElement(BudgetModule, {
    wagered: 23,
    entryFee: me.entryFee,
    betCount: 3,
    minBets: me.minBets,
    maxBets: me.maxBets
  })), /*#__PURE__*/React.createElement(RulesCard, {
    entryFee: me.entryFee,
    maxSingle: me.maxSingle,
    maxSelf: me.maxSelf,
    minBets: me.minBets,
    maxBets: me.maxBets
  }));
}
window.Dashboard = Dashboard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/screens/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/screens/Leaderboard.jsx
try { (() => {
/* Leaderboard — golf standings mirrored from the scoring sheet. Familiar conventions. */
function Leaderboard() {
  const {
    Card,
    Badge
  } = window.DesignSystem_d43214;
  const rows = window.OZ.leaderboard;
  const scoreColor = s => s.startsWith("-") ? "var(--money-up)" : s === "E" ? "var(--text-muted)" : "var(--money-down)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 640,
      margin: "0 auto",
      padding: "20px 16px 40px",
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 30,
      color: "var(--text-strong)"
    }
  }, "Leaderboard"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)",
      marginTop: 2
    }
  }, "Round 3 \xB7 stroke play")), /*#__PURE__*/React.createElement(Badge, {
    tone: "indigo"
  }, "From scoring sheet")), /*#__PURE__*/React.createElement(Card, {
    padding: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "48px 1fr 56px 56px 56px",
      gap: 8,
      padding: "10px 16px",
      borderBottom: "1px solid var(--border)",
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "Pos"), /*#__PURE__*/React.createElement("span", null, "Player"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "center"
    }
  }, "Thru"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, "Today"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, "Total")), rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r.name,
    style: {
      display: "grid",
      gridTemplateColumns: "48px 1fr 56px 56px 56px",
      gap: 8,
      padding: "13px 16px",
      alignItems: "center",
      borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border)",
      background: i === 0 ? "var(--indigo-50)" : "transparent"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontWeight: 700,
      color: i === 0 ? "var(--indigo-700)" : "var(--text-body)"
    }
  }, r.pos), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: "var(--text-strong)"
    }
  }, r.name), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "center",
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, r.thru), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right",
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontSize: 13,
      fontWeight: 600,
      color: scoreColor(r.today)
    }
  }, r.today), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right",
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontSize: 14,
      fontWeight: 700,
      color: scoreColor(r.total)
    }
  }, r.total)))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)",
      textAlign: "center",
      margin: 0
    }
  }, "Scoring, skins & placement money live in the tournament workbook \u2014 shown here read-only."));
}
window.Leaderboard = Leaderboard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/screens/Leaderboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/screens/Login.jsx
try { (() => {
/* Login — the one "brand moment" page. Warm, single field + button. */
function Login({
  onLogin
}) {
  const {
    Button,
    Input
  } = window.DesignSystem_d43214;
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      background: "linear-gradient(0deg, var(--ink-100), var(--ink-50))"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      maxWidth: 380
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/ozark-mark.svg",
    alt: "",
    style: {
      height: 108,
      width: "auto"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 34,
      color: "var(--indigo-700)",
      lineHeight: 1.05,
      marginTop: 8
    }
  }, "Ozark Open"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 20,
      color: "var(--gold-600)",
      lineHeight: 1
    }
  }, "Sportsbook")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-md)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      height: 10,
      backgroundColor: "var(--accent)",
      backgroundImage: "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--accent) 82%, #000) 0 7px, var(--accent) 7px 14px)",
      borderBottom: "1px solid color-mix(in srgb, var(--accent) 70%, #000)",
      boxShadow: "inset 0 -3px 5px -3px rgba(0,0,0,0.35)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24
    }
  }, sent ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 22,
      color: "var(--text-strong)",
      marginBottom: 8
    }
  }, "Check your email"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: "var(--text-muted)",
      lineHeight: 1.5,
      margin: "0 0 20px"
    }
  }, "We sent a magic link to ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text-body)"
    }
  }, email || "your address"), ". Click it to sign in."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true,
    onClick: onLogin
  }, "Continue (demo)")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 22,
      color: "var(--text-strong)",
      marginBottom: 4
    }
  }, "Welcome back"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: "var(--text-muted)",
      lineHeight: 1.5,
      margin: "0 0 18px"
    }
  }, "Enter your email to get a magic link. No passwords, no house."), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: "var(--text-body)",
      display: "block",
      marginBottom: 6
    }
  }, "Email"), /*#__PURE__*/React.createElement(Input, {
    type: "email",
    placeholder: "you@example.com",
    value: email,
    onChange: e => setEmail(e.target.value),
    style: {
      marginBottom: 16
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    size: "lg",
    onClick: () => setSent(true)
  }, "Send magic link")))), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: "center",
      fontSize: 12,
      color: "var(--text-muted)",
      marginTop: 16
    }
  }, "Private pool \xB7 invite only \xB7 24 players")));
}
window.Login = Login;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/screens/Login.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/screens/MyBets.jsx
try { (() => {
/* My Bets — placements by round, running total vs entry, per-bet theoretical payout. */
function MyBets() {
  const {
    BetRow,
    MoneyDisplay,
    OutcomeBadge,
    OddsChip,
    Card,
    ComplianceBanner,
    StatCard
  } = window.DesignSystem_d43214;
  const me = window.OZ.me;
  const bets = window.OZ.myBets;
  const theo = b => {
    if (b.status !== "resolved") return null;
    if (b.outcome === "hit") return b.odds > 0 ? b.stake * (b.odds / 100) + b.stake : b.stake * (100 / Math.abs(b.odds)) + b.stake;
    if (b.outcome === "push" || b.outcome === "void") return b.stake;
    return 0;
  };
  const r1 = bets.filter(b => b.round === 1);
  const r2 = bets.filter(b => b.round === 2);
  const wagered = bets.reduce((s, b) => s + b.stake, 0);
  const payout = bets.reduce((s, b) => s + (theo(b) || 0), 0);
  const ResolvedRow = ({
    b
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 16px",
      borderBottom: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontSize: 12,
      fontWeight: 700,
      color: "var(--text-muted)",
      minWidth: 22
    }
  }, "#", b.n), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: "var(--text-strong)",
      lineHeight: 1.3
    }
  }, b.desc), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(OddsChip, {
    odds: b.odds,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)"
    }
  }, "Stake ", /*#__PURE__*/React.createElement(MoneyDisplay, {
    value: b.stake,
    size: "xs",
    weight: "semibold"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(OutcomeBadge, {
    outcome: b.outcome
  }), /*#__PURE__*/React.createElement(MoneyDisplay, {
    value: theo(b),
    cents: true,
    size: "sm",
    weight: "bold",
    style: {
      color: b.outcome === "hit" ? "var(--money-up)" : "var(--text-body)"
    }
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 640,
      margin: "0 auto",
      padding: "20px 16px 40px",
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 30,
      color: "var(--text-strong)"
    }
  }, "My Bets"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Total Wagered",
    value: wagered,
    money: true,
    caption: `of $${me.entryFee} entry`
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Theoretical Payout",
    value: payout,
    money: true,
    cents: true,
    caption: "So far"
  })), /*#__PURE__*/React.createElement(ComplianceBanner, {
    tone: "success",
    title: "Round 1 balanced"
  }, "You've wagered your full $", me.entryFee, " across ", r1.length, " open bets. You're locked in \u2014 good luck."), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 20,
      color: "var(--indigo-700)",
      marginBottom: 8
    }
  }, "Round 1 \xB7 Open"), /*#__PURE__*/React.createElement(Card, {
    padding: false
  }, r1.map(b => /*#__PURE__*/React.createElement(BetRow, {
    key: b.n,
    number: b.n,
    description: b.desc,
    odds: b.odds,
    status: "closed",
    placed: true,
    stake: String(b.stake)
  })))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 20,
      color: "var(--indigo-700)",
      marginBottom: 8
    }
  }, "Round 2 \xB7 Resolved"), /*#__PURE__*/React.createElement(Card, {
    padding: false
  }, r2.map(b => /*#__PURE__*/React.createElement(ResolvedRow, {
    key: b.n,
    b: b
  })))));
}
window.MyBets = MyBets;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/screens/MyBets.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/screens/Results.jsx
try { (() => {
/* Results — final standings. Celebratory but legible; the screenshot people share. */
function Results() {
  const {
    MoneyDisplay,
    Card,
    Badge
  } = window.DesignSystem_d43214;
  const rows = window.OZ.results.slice().sort((a, b) => b.actual - a.actual);
  const pool = window.OZ.tournament.poolTotal;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 640,
      margin: "0 auto",
      padding: "20px 16px 40px",
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 30,
      color: "var(--text-strong)"
    }
  }, "Results"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)",
      marginTop: 2
    }
  }, "Final pari-mutuel shares")), /*#__PURE__*/React.createElement(Badge, {
    tone: "gold",
    uppercase: true
  }, "Pool $", pool)), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-inverse)",
      borderRadius: "var(--radius-lg)",
      padding: "18px 20px",
      boxShadow: "var(--shadow-md)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.09em",
      color: "var(--gold-300)"
    }
  }, "Top Payout"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 26,
      color: "#fff",
      lineHeight: 1.1,
      marginTop: 2
    }
  }, rows[0].name)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(MoneyDisplay, {
    value: rows[0].actual,
    cents: true,
    size: "xl",
    style: {
      color: "var(--gold-400)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(MoneyDisplay, {
    value: rows[0].pl,
    cents: true,
    pl: true,
    onDark: true,
    size: "sm"
  })))), /*#__PURE__*/React.createElement(Card, {
    padding: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "28px 1fr 78px 78px 66px",
      gap: 8,
      padding: "10px 16px",
      borderBottom: "1px solid var(--border)",
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "#"), /*#__PURE__*/React.createElement("span", null, "Player"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, "Entry"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, "Payout"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, "P/L")), rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r.name,
    style: {
      display: "grid",
      gridTemplateColumns: "28px 1fr 78px 78px 66px",
      gap: 8,
      padding: "12px 16px",
      alignItems: "center",
      borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border)",
      background: i === 0 ? "var(--gold-100)" : "transparent"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-number)",
      fontVariantNumeric: "tabular-nums",
      fontWeight: 700,
      color: i === 0 ? "var(--gold-700)" : "var(--text-muted)"
    }
  }, i + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: "var(--text-strong)"
    }
  }, r.name), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(MoneyDisplay, {
    value: r.entry,
    size: "sm",
    weight: "regular",
    style: {
      color: "var(--text-muted)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(MoneyDisplay, {
    value: r.actual,
    cents: true,
    size: "sm",
    weight: "bold"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(MoneyDisplay, {
    value: r.pl,
    cents: true,
    pl: true,
    size: "sm",
    weight: "semibold"
  }))))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)",
      textAlign: "center",
      margin: 0
    }
  }, "Actual share = your theoretical payout \xF7 everyone's theoretical \xD7 the $", pool, " pool."));
}
window.Results = Results;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/screens/Results.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/tweaks-panel.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
// Exports (to window): useTweaks, TweaksPanel, TweakSection, TweakRow, TweakSlider,
//   TweakToggle, TweakRadio, TweakSelect, TweakText, TweakNumber, TweakColor, TweakButton.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// TweakRadio is the segmented control for 2–3 short options (auto-falls-back to
// TweakSelect past ~16/~10 chars per label); reach for TweakSelect directly when
// options are many or long. For color tweaks always curate 3-4 options rather than
// a free picker; an option can also be a whole 2–5 color palette (the stored value
// is the array). The Tweak* controls are a floor, not a ceiling — build custom
// controls inside the panel if a tweak calls for UI they don't cover.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : {
      [keyOrEdits]: val
    };
    setValues(prev => ({
      ...prev,
      ...edits
    }));
    window.parent.postMessage({
      type: '__edit_mode_set_keys',
      edits
    }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', {
      detail: edits
    }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({
  title = 'Tweaks',
  children
}) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({
    x: 16,
    y: 16
  });
  const PAD = 16;
  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth,
      h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y))
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);
  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);
  React.useEffect(() => {
    const onMsg = e => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({
      type: '__edit_mode_available'
    }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({
      type: '__edit_mode_dismissed'
    }, '*');
  };
  const onDragStart = e => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = ev => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy)
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, __TWEAKS_STYLE), /*#__PURE__*/React.createElement("div", {
    ref: dragRef,
    className: "twk-panel",
    "data-omelette-chrome": "",
    style: {
      right: offsetRef.current.x,
      bottom: offsetRef.current.y
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-hd",
    onMouseDown: onDragStart
  }, /*#__PURE__*/React.createElement("b", null, title), /*#__PURE__*/React.createElement("button", {
    className: "twk-x",
    "aria-label": "Close tweaks",
    onMouseDown: e => e.stopPropagation(),
    onClick: dismiss
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "twk-body"
  }, children)));
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "twk-sect"
  }, label), children);
}
function TweakRow({
  label,
  value,
  children,
  inline = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: inline ? 'twk-row twk-row-h' : 'twk-row'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label), value != null && /*#__PURE__*/React.createElement("span", {
    className: "twk-val"
  }, value)), children);
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label,
    value: `${value}${unit}`
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "twk-slider",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: e => onChange(Number(e.target.value))
  }));
}
function TweakToggle({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-row twk-row-h"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "twk-toggle",
    "data-on": value ? '1' : '0',
    role: "switch",
    "aria-checked": !!value,
    onClick: () => onChange(!value)
  }, /*#__PURE__*/React.createElement("i", null)));
}
function TweakRadio({
  label,
  value,
  options,
  onChange
}) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = o => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({
    2: 16,
    3: 10
  }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = s => {
      const m = options.find(o => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return /*#__PURE__*/React.createElement(TweakSelect, {
      label: label,
      value: value,
      options: options,
      onChange: s => onChange(resolve(s))
    });
  }
  const opts = options.map(o => typeof o === 'object' ? o : {
    value: o,
    label: o
  });
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  const segAt = clientX => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor((clientX - r.left - 2) / inner * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };
  const onPointerDown = e => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = ev => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    role: "radiogroup",
    onPointerDown: onPointerDown,
    className: dragging ? 'twk-seg dragging' : 'twk-seg'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-seg-thumb",
    style: {
      left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
      width: `calc((100% - 4px) / ${n})`
    }
  }), opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    role: "radio",
    "aria-checked": o.value === value
  }, o.label))));
}
function TweakSelect({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("select", {
    className: "twk-field",
    value: value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })));
}
function TweakText({
  label,
  value,
  placeholder,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("input", {
    className: "twk-field",
    type: "text",
    value: value,
    placeholder: placeholder,
    onChange: e => onChange(e.target.value)
  }));
}
function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange
}) {
  const clamp = n => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({
    x: 0,
    val: 0
  });
  const onScrubStart = e => {
    e.preventDefault();
    startRef.current = {
      x: e.clientX,
      val: value
    };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = ev => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "twk-num-lbl",
    onPointerDown: onScrubStart
  }, label), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: value,
    min: min,
    max: max,
    step: step,
    onChange: e => onChange(clamp(Number(e.target.value)))
  }), unit && /*#__PURE__*/React.createElement("span", {
    className: "twk-num-unit"
  }, unit));
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, c => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = n >> 16 & 255,
    g = n >> 8 & 255,
    b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const __TwkCheck = ({
  light
}) => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 14 14",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 7.2 5.8 10 11 4.2",
  fill: "none",
  strokeWidth: "2.2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  stroke: light ? 'rgba(0,0,0,.78)' : '#fff'
}));

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({
  label,
  value,
  options,
  onChange
}) {
  if (!options || !options.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "twk-row twk-row-h"
    }, /*#__PURE__*/React.createElement("div", {
      className: "twk-lbl"
    }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("input", {
      type: "color",
      className: "twk-swatch",
      value: value,
      onChange: e => onChange(e.target.value)
    }));
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = o => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-chips",
    role: "radiogroup"
  }, options.map((o, i) => {
    const colors = Array.isArray(o) ? o : [o];
    const [hero, ...rest] = colors;
    const sup = rest.slice(0, 4);
    const on = key(o) === cur;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      className: "twk-chip",
      role: "radio",
      "aria-checked": on,
      "data-on": on ? '1' : '0',
      "aria-label": colors.join(', '),
      title: colors.join(' · '),
      style: {
        background: hero
      },
      onClick: () => onChange(o)
    }, sup.length > 0 && /*#__PURE__*/React.createElement("span", null, sup.map((c, j) => /*#__PURE__*/React.createElement("i", {
      key: j,
      style: {
        background: c
      }
    }))), on && /*#__PURE__*/React.createElement(__TwkCheck, {
      light: __twkIsLight(hero)
    }));
  })));
}
function TweakButton({
  label,
  onClick,
  secondary = false
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: secondary ? 'twk-btn secondary' : 'twk-btn',
    onClick: onClick
  }, label);
}
Object.assign(window, {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/tweaks-panel.jsx", error: String((e && e.message) || e) }); }

__ds_ns.BetRow = __ds_scope.BetRow;

__ds_ns.MoneyDisplay = __ds_scope.MoneyDisplay;

__ds_ns.OddsChip = __ds_scope.OddsChip;

__ds_ns.OutcomeBadge = __ds_scope.OutcomeBadge;

__ds_ns.StakeInput = __ds_scope.StakeInput;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CardHeader = __ds_scope.CardHeader;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.BudgetModule = __ds_scope.BudgetModule;

__ds_ns.ComplianceBanner = __ds_scope.ComplianceBanner;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.RulesCard = __ds_scope.RulesCard;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Header = __ds_scope.Header;

})();
