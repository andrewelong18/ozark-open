import * as React from "react";

export interface StakeInputProps {
  /** Current whole-dollar value as a string ("" = unplaced). */
  value?: string;
  /** Max single bet for hint/validation display (does not itself clamp). */
  max?: number | null;
  /** Confirmed state — check button turns green, "Bet placed" appears, gold flash. */
  placed?: boolean;
  /** Error message (over max / invalid) — red border + message under the field. */
  error?: string | null;
  disabled?: boolean;
  onChange?: (digits: string) => void;
  /** Fires on Enter or the confirm button. */
  onPlace?: () => void;
  style?: React.CSSProperties;
}

export function StakeInput(props: StakeInputProps): JSX.Element;
