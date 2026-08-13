import { Badge } from "../primitives/Badge";
import { Card } from "../primitives/Card";
import styles from "./ContextCard.module.css";

export function ContextCard({
  sourceType,
  sourceId,
  excerpt,
  toolName,
  observedAt,
  retrievalReason,
  onCopy,
}: {
  sourceType: string;
  sourceId: string;
  excerpt: string;
  toolName: string;
  observedAt: string;
  retrievalReason?: string;
  onCopy?: (sourceId: string) => void | Promise<void>;
}) {
  async function copySourceId() {
    await (onCopy ?? ((value: string) => navigator.clipboard.writeText(value)))(sourceId);
  }

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <Badge tone="evidence">{sourceType}</Badge>
        <Badge>Synthetic fixture</Badge>
      </div>
      <p className={styles.sourceId}>{sourceId}</p>
      <button type="button" className={styles.copy} onClick={() => void copySourceId()}>
        Copy source ID
      </button>
      <p className={styles.excerpt}>{excerpt}</p>
      {retrievalReason ? <p className={styles.reason}>{retrievalReason}</p> : null}
      <p className={styles.metaText}>
        {toolName} · {observedAt}
      </p>
    </Card>
  );
}
