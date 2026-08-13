import { Activity, BookOpen, Copy, Files } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "../primitives/Badge";
import { Card } from "../primitives/Card";
import styles from "./ContextCard.module.css";

const SOURCE_ICONS: Record<string, LucideIcon> = {
  knowledge: BookOpen,
  similar_case: Files,
  service_status: Activity,
};

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
  const Icon = SOURCE_ICONS[sourceType] ?? BookOpen;

  return (
    <Card className={styles.card} tone="evidence">
      <div className={styles.header}>
        <span className={styles.typeIcon} aria-hidden="true">
          <Icon size={14} strokeWidth={2} />
        </span>
        <Badge tone="evidence">{sourceType}</Badge>
        <Badge>Synthetic fixture</Badge>
        <button
          type="button"
          className={styles.copy}
          onClick={() => void copySourceId()}
          aria-label="Copy source ID"
        >
          <Copy size={14} strokeWidth={2} />
        </button>
      </div>
      <p className={styles.sourceId}>{sourceId}</p>
      <p className={styles.excerpt}>{excerpt}</p>
      {retrievalReason ? <p className={styles.reason}>{retrievalReason}</p> : null}
      <p className={styles.metaText}>
        {toolName} · {observedAt}
      </p>
    </Card>
  );
}
