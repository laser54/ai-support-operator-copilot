import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Card.module.css";

export function Card({
  as: Component = "section",
  emphasized = false,
  children,
  className,
  ...rest
}: {
  as?: ElementType;
  emphasized?: boolean;
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Component className={cx(styles.card, emphasized && styles.emphasized, className)} {...rest}>
      {children}
    </Component>
  );
}
