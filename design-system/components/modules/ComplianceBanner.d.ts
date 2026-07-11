import * as React from "react";

export interface ComplianceBannerProps {
  tone?: "warning" | "info" | "success";
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Optional trailing action (e.g. a small Button). */
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export function ComplianceBanner(props: ComplianceBannerProps): JSX.Element;
