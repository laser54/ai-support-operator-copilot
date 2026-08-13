import { LayoutGrid, Sparkles } from "lucide-react";
import { NavLink } from "react-router";
import type { ReactNode } from "react";

import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className={styles.header}>
        <NavLink className={styles.brand} to="/">
          <span className={styles.mark} aria-hidden="true">
            <Sparkles size={15} strokeWidth={2} />
          </span>
          <span className={styles.brandCopy}>
            <span className={styles.brandName}>Operator Copilot</span>
            <span className={styles.brandHint}>reviewer</span>
          </span>
        </NavLink>
        <nav className={styles.nav} aria-label="Workspace">
          <NavLink className={styles.cta} to="/cases/new">
            New case
          </NavLink>
          <NavLink className={styles.iconLink} to="/dev/components" aria-label="Component gallery">
            <LayoutGrid size={16} strokeWidth={2} />
          </NavLink>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </>
  );
}
