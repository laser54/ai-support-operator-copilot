import styles from "./Skeleton.module.css";

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.skeleton} data-testid="loading-skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <div className={styles.block} key={index} />
      ))}
    </div>
  );
}
