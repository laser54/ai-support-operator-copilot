import { CheckCircle2, Circle, CircleAlert, LoaderCircle } from "lucide-react";

import styles from "./TaskRows.module.css";

export type TaskStatus = "waiting" | "running" | "completed" | "failed";

export type TaskRowItem = {
  id: string;
  label: string;
  status: TaskStatus;
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  waiting: "waiting",
  running: "running",
  completed: "completed",
  failed: "failed",
};

function StatusIcon({ status }: { status: TaskStatus }) {
  const props = { size: 16, "aria-hidden": true as const };
  if (status === "completed") {
    return <CheckCircle2 {...props} />;
  }
  if (status === "running") {
    return <LoaderCircle {...props} />;
  }
  if (status === "failed") {
    return <CircleAlert {...props} />;
  }
  return <Circle {...props} />;
}

export function TaskRows({
  items,
  activeId,
  onSelect,
}: {
  items: TaskRowItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <ol className={styles.list}>
      {items.map((item) => {
        const statusText = STATUS_LABEL[item.status];
        return (
          <li key={item.id}>
            <button
              type="button"
              className={styles.row}
              aria-current={activeId === item.id ? "step" : undefined}
              aria-label={`${item.label}, ${statusText}`}
              onClick={() => onSelect?.(item.id)}
            >
              <StatusIcon status={item.status} />
              <span className={styles.label}>{item.label}</span>
              <span className={styles.status}>{statusText}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
