import * as React from "react";

export interface BetRowProps {
  number: number;
  /** Bet description — can be long ("Dan Mercer to finish top 4 + ties"). */
  description: string;
  odds: number;
  status?: "open" | "closed" | "resolved";
  /** When set, replaces the action zone with an OutcomeBadge. */
  outcome?: "hit" | "miss" | "push" | "void" | null;
  /** Show fractional + implied beside the odds chip. */
  oddsDetail?: boolean;
  stake?: string;
  placed?: boolean;
  stakeError?: string | null;
  onStakeChange?: (digits: string) => void;
  onPlace?: () => void;
  style?: React.CSSProperties;
}

/**
 * @startingPoint section="Betting" subtitle="Mobile bet menu row" viewport="700x110"
 */
export function BetRow(props: BetRowProps): JSX.Element;
