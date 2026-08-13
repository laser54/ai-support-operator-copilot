import { useEffect, useState } from "react";

import styles from "./LoadingState.module.css";

const CELLS = 48;

export function LoadingState({ label }: { label: string }) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - started), 100);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={styles.region} aria-busy="true">
      <div className={styles.meta}>
        <p className={styles.status} role="status">
          {label}
        </p>
        <p className={styles.elapsed} aria-hidden="true">
          {(elapsedMs / 1000).toFixed(1)}s
        </p>
      </div>
      <div className={styles.grid} data-testid="loading-skeleton" aria-hidden="true">
        {Array.from({ length: CELLS }, (_, index) => (
          <span className={styles.cell} key={index} style={{ animationDelay: `${(index % 12) * 70}ms` }} />
        ))}
      </div>
    </div>
  );
}
