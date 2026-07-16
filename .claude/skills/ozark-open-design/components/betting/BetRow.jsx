import React from "react";
import { OddsChip } from "./OddsChip.jsx";
import { StatusBadge } from "./StatusBadge.jsx";
import { OutcomeBadge } from "./OutcomeBadge.jsx";
import { StakeInput } from "./StakeInput.jsx";
import { MoneyDisplay } from "./MoneyDisplay.jsx";

/**
 * The workhorse bet row. Mobile-first card layout: number + description on top,
 * odds/status/outcome cluster, and a right-hand action zone that adapts to
 * status — StakeInput when open, placed amount when placed, quiet when closed.
 */
export function BetRow({
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
  style = {},
}) {
  const isOpen = status === "open";
  const dimmed = status === "closed" && !placed;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        background: placed ? "var(--indigo-50)" : "var(--surface-card)",
        borderBottom: "1px solid var(--border)",
        opacity: dimmed ? 0.72 : 1,
        transition: "background var(--dur-base) var(--ease-standard)",
        ...style,
      }}
    >
      {/* Left: number + description + odds cluster */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{
            fontFamily: "var(--font-number)", fontVariantNumeric: "tabular-nums",
            fontSize: "var(--text-xs)", fontWeight: "var(--fw-bold)", color: "var(--text-muted)",
            minWidth: 20,
          }}>#{number}</span>
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: "var(--text-base)",
            fontWeight: "var(--fw-medium)", color: "var(--text-strong)", lineHeight: 1.3,
            textWrap: "pretty",
          }}>{description}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingLeft: 28 }}>
          <OddsChip odds={odds} detail={oddsDetail} size="sm" />
          {status !== "open" && <StatusBadge status={status} />}
        </div>
      </div>

      {/* Right: action zone */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 2 }}>
        {outcome ? (
          <OutcomeBadge outcome={outcome} />
        ) : isOpen ? (
          <StakeInput value={stake} placed={placed} error={stakeError} onChange={onStakeChange} onPlace={onPlace} />
        ) : placed ? (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", fontFamily: "var(--font-sans)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>Placed</div>
            <MoneyDisplay value={Number(stake) || 0} size="md" />
          </div>
        ) : (
          <StatusBadge status={status} />
        )}
      </div>
    </div>
  );
}
