import * as React from "react";

export interface HeaderProps {
  brand?: string;
  /** URL to the golf-flag mark. Omit to render the name alone in Azalea. */
  markSrc?: string | null;
  nav?: string[];
  active?: string;
  /** Logged-in display name; omit to hide the user cluster (e.g. login page). */
  user?: string | null;
  /** Called with the nav label, or "__logout" for the logout button. */
  onNavigate?: (item: string) => void;
  /** Constrain the bar + floating nav to this width (match body content). Number = px. Default full container. */
  maxWidth?: number | string;
  /** Nav treatment: `pill` (rounded floating capsule, default) or `underline` (flat bar with gold underline). */
  navStyle?: "pill" | "underline";
  style?: React.CSSProperties;
}

/**
 * @startingPoint section="Navigation" subtitle="App header + page nav" viewport="900x110"
 */
export function Header(props: HeaderProps): JSX.Element;
