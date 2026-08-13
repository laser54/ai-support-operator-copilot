import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Card.module.css";

export type CardTone = "default" | "request" | "facts" | "ai" | "evidence" | "human";

export function Card({
  as: Component = "section",
  emphasized = false,
  tone = "default",
  children,
  className,
  ...rest
}: {
  as?: ElementType;
  emphasized?: boolean;
  tone?: CardTone;
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Component
      className={cx(styles.card, emphasized && styles.emphasized, tone !== "default" && styles[tone], className)}
      {...rest}
    >
      {children}
    </Component>
  );
}
