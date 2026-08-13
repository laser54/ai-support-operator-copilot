import { Skeleton } from "../primitives/Skeleton";
import styles from "./LoadingState.module.css";

export function LoadingState({ label }: { label: string }) {
  return (
    <div className={styles.region} aria-busy="true">
      <p className={styles.status} role="status">
        {label}
      </p>
      <Skeleton />
    </div>
  );
}
