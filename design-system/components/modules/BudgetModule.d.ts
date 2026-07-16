import * as React from "react";

export interface BudgetModuleProps {
  wagered?: number;
  entryFee?: number;
  betCount?: number;
  minBets?: number;
  maxBets?: number;
  /** Hide the min/remaining footer — for header/dashboard condensed use. */
  compact?: boolean;
  style?: React.CSSProperties;
}

/**
 * @startingPoint section="Modules" subtitle="Wagered-of-entry progress" viewport="700x150"
 */
export function BudgetModule(props: BudgetModuleProps): JSX.Element;
