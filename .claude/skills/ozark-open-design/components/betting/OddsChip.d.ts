import * as React from "react";

export interface OddsChipProps {
  /** American odds, e.g. 150 or -130. Sign drives color (green / ink). */
  odds: number;
  size?: "sm" | "md" | "lg";
  /** Reveal fractional (3-2) + implied probability (40.0%) beside the chip. */
  detail?: boolean;
  style?: React.CSSProperties;
}

/**
 * @startingPoint section="Betting" subtitle="American odds token +150 / -130" viewport="700x150"
 */
export function OddsChip(props: OddsChipProps): JSX.Element;
