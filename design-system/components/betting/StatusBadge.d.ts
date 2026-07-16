import * as React from "react";

export interface StatusBadgeProps {
  /** Bet lifecycle. `draft` is never surfaced to participants. */
  status?: "open" | "closed" | "resolved";
  style?: React.CSSProperties;
}

export function StatusBadge(props: StatusBadgeProps): JSX.Element;
