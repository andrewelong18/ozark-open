import * as React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Larger drop shadow for a lifted, focal card. */
  elevated?: boolean;
  /** Clubhouse-awning gold stripe band across the top — use for the one "brand moment" card on a screen. */
  accent?: boolean;
  /** Inner padding. Pass `false`/`null` to opt out (e.g. edge-to-edge tables). */
  padding?: number | string | false | null;
  children?: React.ReactNode;
}

export interface CardHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * @startingPoint section="Surfaces" subtitle="Clubhouse reference card" viewport="700x220"
 */
export function Card(props: CardProps): JSX.Element;
export function CardHeader(props: CardHeaderProps): JSX.Element;
