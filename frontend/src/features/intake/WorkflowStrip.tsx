import { WORKFLOW_STEPS } from "./constants";
import styles from "./WorkflowStrip.module.css";

export function WorkflowStrip() {
  return (
    <ol className={styles.list} aria-label="Workflow">
      {WORKFLOW_STEPS.map((step, index) => (
        <li className={styles.step} key={step}>
          {index > 0 ? <span className={styles.arrow} aria-hidden="true">{`→ `}</span> : null}
          {step}
        </li>
      ))}
    </ol>
  );
}
