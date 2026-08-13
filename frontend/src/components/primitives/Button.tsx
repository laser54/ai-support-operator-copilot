import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { cx } from "../cx";
import styles from "./Button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  loading = false,
  children,
  className,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "secondary" ? styles.secondary : variant === "danger" ? styles.danger : styles.primary;

  return (
    <button
      {...props}
      type={type}
      className={cx(styles.button, variantClass, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <LoaderCircle aria-hidden size={16} /> : null}
      {children}
    </button>
  );
}
