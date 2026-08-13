import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "./Badge";
import styles from "./SectionHeading.module.css";

export function SectionHeading({
  icon: Icon,
  children,
  mark,
  markTone = "review",
}: {
  icon: LucideIcon;
  children: ReactNode;
  mark?: string;
  markTone?: "neutral" | "primary" | "evidence" | "review" | "success" | "warning" | "danger";
}) {
  return (
    <div className={styles.wrap}>
      <span className={styles.icon} aria-hidden="true">
        <Icon size={14} strokeWidth={2} />
      </span>
      <h2 className={styles.title}>{children}</h2>
      {mark ? <Badge tone={markTone}>{mark}</Badge> : null}
    </div>
  );
}
