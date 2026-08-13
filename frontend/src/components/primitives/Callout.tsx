import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Callout.module.css";

export function Callout({
  tone = "info",
  title,
  icon: Icon,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className={cx(styles.callout, styles[tone])} role="note">
      {title ? (
        <h2 className={styles.title}>
          {Icon ? <Icon size={14} strokeWidth={2} aria-hidden="true" /> : null}
          {title}
        </h2>
      ) : null}
      {children}
    </div>
  );
}
