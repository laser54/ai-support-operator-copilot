import { useState } from "react";

import { ApprovalCard } from "../components/patterns/ApprovalCard";
import { ContextCard } from "../components/patterns/ContextCard";
import { FilterTable } from "../components/patterns/FilterTable";
import { RecommendationCard } from "../components/patterns/RecommendationCard";
import { TaskRows } from "../components/patterns/TaskRows";
import { Badge } from "../components/primitives/Badge";
import { Button } from "../components/primitives/Button";
import { Callout } from "../components/primitives/Callout";
import { Card } from "../components/primitives/Card";
import { Dialog } from "../components/primitives/Dialog";
import { TextArea } from "../components/primitives/TextArea";
import { TextField } from "../components/primitives/TextField";
import styles from "./DevComponentsPage.module.css";

export function DevComponentsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className={styles.page}>
      <h1>Component gallery</h1>
      <p>Local primitives and Beautiful UI adaptations for the reviewer workspace.</p>

      <Card>
        <h2>Buttons and badges</h2>
        <div className={styles.row}>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="danger">Reject</Button>
        <Button loading>Saving</Button>
        <Badge tone="success">Waiting for review</Badge>
        <Badge tone="warning">Still needed</Badge>
        </div>
      </Card>

      <TextField label="Case ID" hint="Monospace identifiers stay copyable." defaultValue="case-1" />
      <TextArea label="Reply draft" defaultValue="We are investigating the login failure." />
      <TextField label="Broken field" error="This value is required" />

      <Button variant="secondary" onClick={() => setDialogOpen(true)}>
        Open dialog
      </Button>
      <Dialog open={dialogOpen} title="Approve and create mock incident" onClose={() => setDialogOpen(false)}>
        <p>Confirmation stays open while a review request is in flight.</p>
      </Dialog>

      <Callout tone="warning" title="Synthetic fixtures">
        Evidence in this demo is fixture-backed and not a production status feed.
      </Callout>

      <TaskRows
        items={[
          { id: "request", label: "Request", status: "completed" },
          { id: "evidence", label: "Evidence", status: "completed" },
          { id: "brief", label: "Brief", status: "completed" },
          { id: "review", label: "Human review", status: "waiting" },
          { id: "outcome", label: "Outcome", status: "waiting" },
        ]}
      />
      <RecommendationCard
        title="Create incident"
        actionPreview="create_incident: portal auth 5xx"
        evidenceStrength="Three fixture sources agree on a post-release 5xx pattern."
        policyResult="Approval required. The API will not execute this action yet."
        uncertainty="First observed timestamp is still missing."
      />
      <ApprovalCard
        title="Create mock incident"
        summary="Engineering incident draft. Mock-only side effect after approval."
        onApprove={() => undefined}
        onReject={() => undefined}
      />
      <ContextCard
        sourceType="knowledge"
        sourceId="kb-auth-5xx-after-release"
        excerpt="Reset auth sessions after a 5xx release."
        toolName="search_knowledge"
        observedAt="2026-08-12T10:42:00Z"
        retrievalReason="Matched login HTTP 500 after update"
      />
      <FilterTable
        events={[
          { id: "1", category: "workflow", label: "Case created" },
          { id: "2", category: "tools", label: "Knowledge searched" },
          { id: "3", category: "human", label: "Review recorded" },
          { id: "4", category: "execution", label: "Mock incident executed" },
        ]}
      />
    </div>
  );
}
