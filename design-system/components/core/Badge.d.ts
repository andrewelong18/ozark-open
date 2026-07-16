import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "indigo" | "gold" | "green" | "red" | "amber" | "solid";
  icon?: React.ReactNode;
  uppercase?: boolean;
  children?: React.ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;
