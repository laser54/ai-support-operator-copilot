import { Link } from "react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  History,
  Layers,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import { getApiBaseUrl } from "../api/runtime";
import { cx } from "../components/cx";
import { Badge } from "../components/primitives/Badge";
import buttonStyles from "../components/primitives/Button.module.css";
import { WorkflowStrip } from "../features/intake/WorkflowStrip";
import { DEMO_SCENARIOS } from "../features/intake/constants";
import styles from "./HomePage.module.css";

export function HomePage() {
  return (
    <div className={styles.page}>
      {/* Hero Section */}
      <div className={styles.hero}>
        <div className={styles.heroBadge}>
          <Sparkles size={13} className={styles.sparkleIcon} />
          <span>LangGraph · Bounded Autonomy · Human-in-the-Loop</span>
        </div>
        <h1>AI Support Operator Copilot</h1>
        <p className={styles.lede}>Evidence-backed review before any action executes.</p>
        <p className={styles.heroSub}>
          An enterprise-grade, deterministic AI workflow that turns chaotic support tickets into
          structured triage, queries cross-system evidence, and pauses at policy gates for human
          verification.
        </p>

        <div className={styles.workflowContainer}>
          <WorkflowStrip />
        </div>

        <div className={styles.actions}>
          <Link className={cx(buttonStyles.button, buttonStyles.primary)} to="/cases/new">
            Create demo case
          </Link>
          <Link className={cx(buttonStyles.button, buttonStyles.secondary)} to="/artifacts">
            <BookOpen size={15} />
            Knowledge Catalog
          </Link>
          <a
            className={styles.docs}
            href={`${getApiBaseUrl()}/docs`}
            target="_blank"
            rel="noreferrer"
          >
            API documentation
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Trust & Guarantee Box */}
      <section className={styles.trustSection} aria-label="Core Guarantees">
        <ul className={styles.trust}>
          <li>
            <CheckCircle2 size={16} className={styles.trustIcon} />
            <span>Fixture-backed evidence with stable source IDs</span>
          </li>
          <li>
            <ShieldCheck size={16} className={styles.trustIcon} />
            <span>Human approval required before any mock incident is created</span>
          </li>
          <li>
            <History size={16} className={styles.trustIcon} />
            <span>Traceable decisions in an ordered audit trail</span>
          </li>
        </ul>
      </section>

      {/* Architectural Pillars */}
      <section className={styles.pillarsSection} aria-labelledby="pillars-heading">
        <div className={styles.sectionHeader}>
          <h2 id="pillars-heading">Architectural Highlights</h2>
          <p className={styles.sectionSub}>
            Why bounded autonomy and deterministic gates beat unconstrained chatbots in
            mission-critical operations:
          </p>
        </div>

        <div className={styles.pillarsGrid}>
          <article className={styles.pillarCard}>
            <div className={styles.pillarHeader}>
              <div className={cx(styles.pillarIconWrap, styles.iconWarning)}>
                <ShieldCheck size={18} />
              </div>
              <div className={styles.pillarTags}>
                <Badge tone="warning">Zero Autonomous Writes</Badge>
                <Badge tone="neutral">Policy Gate</Badge>
              </div>
            </div>
            <h3>Bounded Autonomy & Policy Gate</h3>
            <p>
              The LLM has strictly zero write access to external systems. High-impact operations
              (such as creating incident tickets) are generated purely as proposals and blocked by
              code until explicit operator sign-off.
            </p>
          </article>

          <article className={styles.pillarCard}>
            <div className={styles.pillarHeader}>
              <div className={cx(styles.pillarIconWrap, styles.iconEvidence)}>
                <Layers size={18} />
              </div>
              <div className={styles.pillarTags}>
                <Badge tone="evidence">Traceable IDs</Badge>
                <Badge tone="neutral">Deterministic</Badge>
              </div>
            </div>
            <h3>Multi-Source Evidence Grounding</h3>
            <p>
              Parallel deterministic tools query Runbooks (<code>kb-*</code>), Historical Incidents
              (<code>inc-*</code>), and Live Status (<code>status-*</code>). Inferences and missing
              data are strictly separated from user facts.
            </p>
          </article>

          <article className={styles.pillarCard}>
            <div className={styles.pillarHeader}>
              <div className={cx(styles.pillarIconWrap, styles.iconReview)}>
                <Workflow size={18} />
              </div>
              <div className={styles.pillarTags}>
                <Badge tone="review">LangGraph State</Badge>
                <Badge tone="neutral">Offline Fallback</Badge>
              </div>
            </div>
            <h3>State Machine & Dual-Engine Resilience</h3>
            <p>
              Explicit LangGraph orchestration with durable PostgreSQL checkpointing. If the LLM
              provider fails, times out, or lacks credentials, a deterministic offline engine takes
              over with zero downtime.
            </p>
          </article>

          <article className={styles.pillarCard}>
            <div className={styles.pillarHeader}>
              <div className={cx(styles.pillarIconWrap, styles.iconPrimary)}>
                <History size={18} />
              </div>
              <div className={styles.pillarTags}>
                <Badge tone="primary">Strict Sequence</Badge>
                <Badge tone="neutral">Idempotent</Badge>
              </div>
            </div>
            <h3>Immutable Audit & Idempotency</h3>
            <p>
              Every graph transition, tool call, and operator edit is preserved in an immutable,
              ordered audit log (<code>/cases/&#123;id&#125;/trace</code>). Primary key constraints
              prevent duplicate incident creation upon repeat approvals.
            </p>
          </article>
        </div>
      </section>

      {/* Interactive Demo Scenarios */}
      <section className={styles.scenariosSection} aria-labelledby="scenarios-heading">
        <div className={styles.sectionHeader}>
          <h2 id="scenarios-heading">Interactive Demo Scenarios</h2>
          <p className={styles.sectionSub}>
            Select any real-world failure mode to test the copilot workflow with pre-configured
            fixtures:
          </p>
        </div>

        <div className={styles.scenariosGrid}>
          {DEMO_SCENARIOS.map((scenario) => (
            <Link
              key={scenario.id}
              to={`/cases/new?scenario=${scenario.id}`}
              className={styles.scenarioCard}
            >
              <div className={styles.scenarioTop}>
                <span className={styles.scenarioTitle}>{scenario.title}</span>
                <ArrowRight size={14} className={styles.scenarioArrow} />
              </div>
              <p className={styles.scenarioSnippet}>{scenario.text}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Tech Stack Banner */}
      <div className={styles.techStackBanner}>
        <span className={styles.techStackLabel}>Engineering Stack:</span>
        <div className={styles.techStackPills}>
          <span>Python 3.12</span>
          <span className={styles.dot} aria-hidden="true">•</span>
          <span>FastAPI</span>
          <span className={styles.dot} aria-hidden="true">•</span>
          <span>LangGraph</span>
          <span className={styles.dot} aria-hidden="true">•</span>
          <span>PostgreSQL</span>
          <span className={styles.dot} aria-hidden="true">•</span>
          <span>Pydantic v2</span>
          <span className={styles.dot} aria-hidden="true">•</span>
          <span>SQLAlchemy 2</span>
          <span className={styles.dot} aria-hidden="true">•</span>
          <span>React 19 / TypeScript</span>
          <span className={styles.dot} aria-hidden="true">•</span>
          <span>Docker Compose</span>
        </div>
      </div>
    </div>
  );
}
