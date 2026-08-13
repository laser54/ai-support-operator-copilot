import type { InputHTMLAttributes } from "react";

import { cx } from "../cx";
import { FieldChrome } from "./FieldChrome";
import { describedBy, useFieldIds } from "./fieldIds";
import styles from "./Field.module.css";

export type TextFieldProps = {
  label: string;
  hint?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function TextField({ label, hint, error, id, className, ...props }: TextFieldProps) {
  const { inputId, hintId, errorId } = useFieldIds(id);

  return (
    <FieldChrome
      label={label}
      inputId={inputId}
      hint={hint}
      error={error}
      hintId={hintId}
      errorId={errorId}
    >
      <input
        {...props}
        id={inputId}
        className={cx(styles.control, error && styles.invalid, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, hintId, errorId)}
      />
    </FieldChrome>
  );
}
