import * as React from "react";

export interface OutcomeBadgeProps {
  /** hit = win (green), miss = loss (red), push/void = neutral (stake returned). */
  outcome?: "hit" | "miss" | "push" | "void";
  size?: "sm" | "md";
  style?: React.CSSProperties;
}

export function OutcomeBadge(props: OutcomeBadgeProps): JSX.Element;
