import { Card } from "../primitives/Card";
import { Badge } from "../primitives/Badge";
import styles from "./RecommendationCard.module.css";

export function RecommendationCard({
  title,
  actionPreview,
  evidenceStrength,
  policyResult,
  uncertainty,
}: {
  title: string;
  actionPreview: string;
  evidenceStrength: string;
  policyResult: string;
  uncertainty: string;
}) {
  return (
    <Card className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
      <Badge tone="review">Approval required</Badge>
      <p className={styles.preview}>{actionPreview}</p>
      <p className={styles.meta}>
        <strong>Evidence strength.</strong> {evidenceStrength}
      </p>
      <p className={styles.meta}>
        <strong>Policy result.</strong> {policyResult}
      </p>
      <p className={styles.meta}>
        <strong>Uncertainty.</strong> {uncertainty}
      </p>
    </Card>
  );
}
