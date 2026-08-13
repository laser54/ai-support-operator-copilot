import type { Ref, TextareaHTMLAttributes } from "react";

import { cx } from "../cx";
import { FieldChrome } from "./FieldChrome";
import { describedBy, useFieldIds } from "./fieldIds";
import styles from "./Field.module.css";

export type TextAreaProps = {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({
  label,
  hint,
  error,
  id,
  className,
  ref,
  ...props
}: TextAreaProps) {
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
      <textarea
        {...props}
        ref={ref}
        id={inputId}
        className={cx(styles.control, styles.textarea, error && styles.invalid, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, hintId, errorId)}
      />
    </FieldChrome>
  );
}
