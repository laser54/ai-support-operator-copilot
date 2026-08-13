import { Shield } from "lucide-react";

import { Button } from "../primitives/Button";
import { Card } from "../primitives/Card";
import { SectionHeading } from "../primitives/SectionHeading";
import styles from "./ApprovalCard.module.css";

export function ApprovalCard({
  title,
  summary,
  busy = false,
  onApprove,
  onReject,
}: {
  title: string;
  summary: string;
  busy?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Card emphasized className={styles.card} tone="human">
      <SectionHeading icon={Shield}>{title}</SectionHeading>
      <p className={styles.summary}>{summary}</p>
      <p className={styles.policy}>This action cannot run until you approve it.</p>
      <div className={styles.actions}>
        <Button loading={busy} onClick={onApprove}>
          Approve and create mock incident
        </Button>
        <Button variant="danger" disabled={busy} onClick={onReject}>
          Reject proposal
        </Button>
      </div>
    </Card>
  );
}
