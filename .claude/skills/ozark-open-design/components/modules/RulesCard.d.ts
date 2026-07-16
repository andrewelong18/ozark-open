import * as React from "react";

export interface RulesCardProps {
  entryFee?: number;
  maxSingle?: number;
  maxSelf?: number;
  minBets?: number;
  maxBets?: number;
  style?: React.CSSProperties;
}

export function RulesCard(props: RulesCardProps): JSX.Element;
