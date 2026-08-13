import type { ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Badge.module.css";

type BadgeTone = "neutral" | "primary" | "evidence" | "review" | "success" | "warning" | "danger";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cx(styles.badge, styles[tone])}>{children}</span>;
}
