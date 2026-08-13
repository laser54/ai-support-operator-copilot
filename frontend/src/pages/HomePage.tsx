import { Link } from "react-router";

import { getApiBaseUrl } from "../api/runtime";
import { cx } from "../components/cx";
import buttonStyles from "../components/primitives/Button.module.css";
import { WorkflowStrip } from "../features/intake/WorkflowStrip";
import styles from "./HomePage.module.css";

export function HomePage() {
  return (
    <div className={styles.page}>
      <h1>AI Support Operator Copilot</h1>
      <p className={styles.lede}>Evidence-backed review before any action executes.</p>
      <WorkflowStrip />
      <ul className={styles.trust}>
        <li>Fixture-backed evidence with stable source IDs</li>
        <li>Human approval required before any mock incident is created</li>
        <li>Traceable decisions in an ordered audit trail</li>
      </ul>
      <div className={styles.actions}>
        <Link className={cx(buttonStyles.button, buttonStyles.primary)} to="/cases/new">
          Create demo case
        </Link>
        <a className={styles.docs} href={`${getApiBaseUrl()}/docs`}>
          API documentation
        </a>
      </div>
    </div>
  );
}
