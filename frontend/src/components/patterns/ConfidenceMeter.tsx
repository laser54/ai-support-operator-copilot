import { cx } from "../cx";
import styles from "./ConfidenceMeter.module.css";

export type ConfidenceLevel = "high" | "medium" | "low";

export function ConfidenceMeter({
  level,
  score,
  showScore = true,
  className,
}: {
  level?: ConfidenceLevel;
  score?: number;
  showScore?: boolean;
  className?: string;
}) {
  const computedLevel: ConfidenceLevel =
    level ?? (score !== undefined ? (score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low") : "high");
  const computedScore = score !== undefined ? Math.round(score * 100) : 88;

  const activeCount = computedLevel === "high" ? 3 : computedLevel === "medium" ? 2 : 1;
  const labelText =
    computedLevel === "high" ? "High confidence" : computedLevel === "medium" ? "Medium confidence" : "Low confidence";

  return (
    <div
      className={cx(styles.confidenceMeter, className)}
      title={`AI Confidence: ${computedScore}% confidence (${labelText})`}
    >
      <div className={styles.bars} data-level={computedLevel} aria-hidden="true">
        <span className={cx(styles.bar, activeCount >= 1 && styles.activeBar)} />
        <span className={cx(styles.bar, activeCount >= 2 && styles.activeBar)} />
        <span className={cx(styles.bar, activeCount >= 3 && styles.activeBar)} />
      </div>
      <span className={styles.meterText}>
        {labelText}
        {showScore ? ` (${computedScore}% confidence)` : ""}
      </span>
    </div>
  );
}
