import type { ReactNode } from "react";

import styles from "./Field.module.css";

export function FieldChrome({
  label,
  inputId,
  hint,
  error,
  hintId,
  errorId,
  children,
}: {
  label: string;
  inputId: string;
  hint?: string;
  error?: string;
  hintId: string;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
