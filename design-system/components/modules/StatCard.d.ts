import * as React from "react";

export interface StatCardProps {
  label: string;
  /** Number, string, or dollar amount (with `money`). */
  value: number | string;
  money?: boolean;
  cents?: boolean;
  caption?: React.ReactNode;
  /** Indigo clubhouse treatment — reserve for the marquee tile (pool total). */
  feature?: boolean;
  style?: React.CSSProperties;
}

/**
 * @startingPoint section="Modules" subtitle="Dashboard stat tile" viewport="700x150"
 */
export function StatCard(props: StatCardProps): JSX.Element;
