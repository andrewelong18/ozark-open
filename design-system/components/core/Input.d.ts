import * as React from "react";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md" | "lg";
  invalid?: boolean;
  disabled?: boolean;
  /** Adornment rendered before the field (e.g. a "$" or search glyph). */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function Input(props: InputProps): JSX.Element;
