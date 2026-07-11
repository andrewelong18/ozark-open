import * as React from "react";

export interface MoneyDisplayProps {
  /** Dollar amount. Negative renders with a minus (or +/− when `pl`). */
  value: number;
  /** Show cents (payouts). Off = whole dollars (stakes, entries). */
  cents?: boolean;
  /** Profit/loss mode — colors + signs the value (green up, red down). */
  pl?: boolean;
  /** On an indigo/dark surface — switches P/L to accessible light green/red. */
  onDark?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  weight?: "regular" | "medium" | "semibold" | "bold";
  style?: React.CSSProperties;
}

export function MoneyDisplay(props: MoneyDisplayProps): JSX.Element;
