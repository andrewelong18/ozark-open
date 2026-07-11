import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `gold` is reserved for the single marquee action (e.g. Place Bets). */
  variant?: "primary" | "gold" | "secondary" | "ghost" | "destructive";
  /** Height preset. All meet the >=44px touch floor except `sm` (36px, desktop-dense only). */
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  disabled?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * @startingPoint section="Controls" subtitle="Indigo & gold action buttons" viewport="700x180"
 */
export function Button(props: ButtonProps): JSX.Element;
