import { useState } from "react";
import { Cpu, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Card } from "../primitives/Card";
import { Badge } from "../primitives/Badge";
import { ConfidenceMeter } from "./ConfidenceMeter";
import styles from "./RecommendationCard.module.css";

export function RecommendationCard({
  title,
  actionPreview,
  evidenceStrength,
  policyResult,
  uncertainty,
  confidence,
}: {
  title: string;
  actionPreview: string;
  evidenceStrength: string;
  policyResult: string;
  uncertainty: string;
  confidence?: number;
}) {
  const [showTelemetry, setShowTelemetry] = useState(false);

  return (
    <Card className={styles.card} tone="ai">
      <div className={styles.categoryBanner}>
        <Sparkles size={12} className={styles.bannerIcon} aria-hidden="true" />
        <span>AI Proposed Resolution Brief</span>
      </div>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.badges}>
            <Badge tone="review">Approval required</Badge>
            <span className={styles.livePulse} aria-hidden="true">
              <span className={styles.pulseDot} /> Live AI Inference
            </span>
          </div>
        </div>
      </div>

      <p className={styles.preview}>{actionPreview}</p>

      <div className={styles.metaGrid}>
        <p className={styles.meta}>
          <strong>Evidence strength.</strong> {evidenceStrength}
        </p>
        <p className={styles.meta}>
          <strong>Policy result.</strong> {policyResult}
        </p>
        <p className={styles.meta}>
          <strong>Uncertainty.</strong> {uncertainty}
        </p>
      </div>

      {confidence !== undefined ? (
        <div className={styles.meterFooter}>
          <ConfidenceMeter score={confidence} />
        </div>
      ) : null}

      <div className={styles.telemetrySection}>
        <button
          type="button"
          className={styles.telemetryToggle}
          onClick={() => setShowTelemetry((prev) => !prev)}
        >
          <Cpu size={14} /> AI Telemetry Stream
          {showTelemetry ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showTelemetry ? (
          <div className={styles.telemetryStream}>
            <div className={styles.telemetryItem}>
              <Sparkles size={13} className={styles.telemetryIcon} />
              <span>Extracted 5xx error signature from telemetry logs</span>
            </div>
            <div className={styles.telemetryItem}>
              <Sparkles size={13} className={styles.telemetryIcon} />
              <span>Cross-referenced KB article kb-auth-5xx-after-release</span>
            </div>
            <div className={styles.telemetryItem}>
              <Sparkles size={13} className={styles.telemetryIcon} />
              <span>Evaluated human review policy constraint: Policy gate passed</span>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
