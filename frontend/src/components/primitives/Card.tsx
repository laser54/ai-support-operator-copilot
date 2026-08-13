import type { ElementType, ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Card.module.css";

export function Card({
  as: Component = "section",
  emphasized = false,
  children,
  className,
}: {
  as?: ElementType;
  emphasized?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Component className={cx(styles.card, emphasized && styles.emphasized, className)}>
      {children}
    </Component>
  );
}
