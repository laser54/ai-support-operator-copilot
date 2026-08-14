import { BookOpen } from "lucide-react";
import { NavLink } from "react-router";
import type { ReactNode } from "react";

import { BrandMark } from "../components/brand/BrandMark";
import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className={styles.header}>
        <NavLink className={styles.brand} to="/" title="AI Support Operator Copilot">
          <span className={styles.mark} aria-hidden="true">
            <BrandMark size={24} />
          </span>
          <span className={styles.brandCopy}>
            <span className={styles.brandName}>Operator Copilot</span>
            <span className={styles.brandHint}>reviewer</span>
          </span>
        </NavLink>
        <nav className={styles.nav} aria-label="Workspace">
          <NavLink className={styles.navLink} to="/artifacts" title="Knowledge Catalog">
            <BookOpen size={15} strokeWidth={2} />
            <span className={styles.navLabelLong}>Knowledge Catalog</span>
            <span className={styles.navLabelShort}>Catalog</span>
          </NavLink>
          <NavLink className={styles.cta} to="/cases/new">
            New case
          </NavLink>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </>
  );
}
