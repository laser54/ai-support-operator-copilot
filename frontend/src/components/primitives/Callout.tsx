import type { ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Callout.module.css";

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx(styles.callout, styles[tone])} role="note">
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      {children}
    </div>
  );
}
