import * as React from "react";

export interface EmptyStateProps {
  /** Emoji/glyph in the badge. Defaults to a golf flag. */
  glyph?: string;
  title: React.ReactNode;
  message?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export function EmptyState(props: EmptyStateProps): JSX.Element;
