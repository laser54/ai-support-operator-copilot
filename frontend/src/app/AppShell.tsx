import { NavLink } from "react-router";
import type { ReactNode } from "react";

import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className={styles.header}>
        <NavLink className={styles.brand} to="/">
          AI Support Operator Copilot
        </NavLink>
        <nav className={styles.nav} aria-label="Workspace">
          <NavLink className={styles.link} to="/cases/new">
            Create demo case
          </NavLink>
          <NavLink className={styles.link} to="/dev/components">
            Component gallery
          </NavLink>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </>
  );
}
