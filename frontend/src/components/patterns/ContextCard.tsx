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
}: {
  sourceType: string;
  sourceId: string;
  excerpt: string;
  toolName: string;
  observedAt: string;
  retrievalReason: string;
}) {
  async function copySourceId() {
    await navigator.clipboard.writeText(sourceId);
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
      <p className={styles.reason}>{retrievalReason}</p>
      <p className={styles.metaText}>
        {toolName} · {observedAt}
      </p>
    </Card>
  );
}
