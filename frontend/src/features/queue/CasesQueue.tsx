import { ArrowRight, ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react";
import { Link } from "react-router";

import type { CaseQueueItem, CaseStatus, Priority } from "../../api/types";
import { Badge } from "../../components/primitives/Badge";
import { Button } from "../../components/primitives/Button";
import { Callout } from "../../components/primitives/Callout";
import { statusLabel } from "../case-review/status";
import styles from "./CasesQueue.module.css";

export type CasesQueueProps = {
  items: CaseQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  error?: string | null;
  statusFilter: CaseStatus | "";
  priorityFilter: Priority | "";
  searchQuery: string;
  onStatusChange: (status: CaseStatus | "") => void;
  onPriorityChange: (priority: Priority | "") => void;
  onSearchChange: (q: string) => void;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  onRetry: () => void;
};

function priorityTone(priority: Priority): "danger" | "warning" | "primary" | "neutral" {
  switch (priority) {
    case "P1":
      return "danger";
    case "P2":
      return "warning";
    case "P3":
      return "primary";
    case "P4":
    default:
      return "neutral";
  }
}

function caseStatusTone(status: CaseStatus): "review" | "success" | "danger" | "neutral" {
  switch (status) {
    case "awaiting_human_review":
      return "review";
    case "completed":
      return "success";
    case "rejected":
      return "danger";
    case "received":
    default:
      return "neutral";
  }
}

export function CasesQueue({
  items,
  total,
  page,
  pageSize,
  totalPages,
  loading,
  error,
  statusFilter,
  priorityFilter,
  searchQuery,
  onStatusChange,
  onPriorityChange,
  onSearchChange,
  onPageChange,
  onResetFilters,
  onRetry,
}: CasesQueueProps) {
  const isDirty = Boolean(statusFilter || priorityFilter || searchQuery.trim());
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(total, page * pageSize);

  return (
    <div className={styles.queueContainer}>
      <div className={styles.toolbar} role="search" aria-label="Cases queue filters">
        <div className={styles.filtersGroup}>
          <div className={styles.searchBox}>
            <Search size={16} className={styles.searchIcon} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search cases by text or UUID"
              className={`input ${styles.searchInput}`}
              placeholder="Search request text or exact UUID..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className={styles.selectGroup}>
            <label htmlFor="queue-status-filter" className="sr-only">
              Filter by status
            </label>
            <select
              id="queue-status-filter"
              aria-label="Filter by status"
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(e) => onStatusChange(e.target.value as CaseStatus | "")}
            >
              <option value="">All statuses</option>
              <option value="awaiting_human_review">Waiting for review</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="received">Received</option>
            </select>

            <label htmlFor="queue-priority-filter" className="sr-only">
              Filter by priority
            </label>
            <select
              id="queue-priority-filter"
              aria-label="Filter by priority"
              className={styles.filterSelect}
              value={priorityFilter}
              onChange={(e) => onPriorityChange(e.target.value as Priority | "")}
            >
              <option value="">All priorities</option>
              <option value="P1">P1 · Critical</option>
              <option value="P2">P2 · High</option>
              <option value="P3">P3 · Medium</option>
              <option value="P4">P4 · Low</option>
            </select>

            {isDirty ? (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={onResetFilters}
                aria-label="Reset all queue filters"
              >
                <RotateCcw size={12} style={{ display: "inline", marginRight: "0.25rem" }} />
                Reset filters
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <Callout tone="danger" title="Could not load cases queue">
          <p role="alert">{error}</p>
          <Button onClick={onRetry}>Retry</Button>
        </Callout>
      ) : null}

      {loading && !items.length ? (
        <div className={styles.list} aria-busy="true" aria-label="Loading cases">
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className={styles.emptyBox}>
          <h3 className={styles.emptyTitle}>No cases found</h3>
          <p className={styles.emptyText}>
            {isDirty
              ? "No cases matched your current search and filter settings. Try resetting filters."
              : "The queue is currently empty. Ingest a new support request to begin."}
          </p>
          <div className={styles.emptyActions}>
            {isDirty ? (
              <Button variant="secondary" onClick={onResetFilters}>
                Reset filters
              </Button>
            ) : null}
            <Link to="/cases/new">
              <Button>Create new case</Button>
            </Link>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className={styles.list} role="feed" aria-label="Cases list">
          {items.map((item) => (
            <article key={item.case_id} className={styles.caseCard}>
              <div className={styles.cardHeader}>
                <div className={styles.metaBadges}>
                  <Badge tone={caseStatusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  <Badge tone={priorityTone(item.priority)}>{item.priority}</Badge>
                  {item.risk ? <Badge tone="warning">{item.risk} risk</Badge> : null}
                  <span className={styles.versionBadge} title={`Workflow version ${item.version}`}>
                    v{item.version}
                  </span>
                </div>
                <span className={styles.caseId} title={item.case_id}>
                  {item.case_id.slice(0, 8)}...
                </span>
              </div>

              <p className={styles.caseSnippet}>{item.request_text}</p>

              <div className={styles.cardFooter}>
                <span>Created {new Date(item.created_at).toLocaleString()}</span>
                <Link
                  to={`/cases/${item.case_id}`}
                  className={styles.openLink}
                  aria-label={`Open case ${item.case_id}`}
                >
                  Open case <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {total > 0 ? (
        <nav className={styles.pagination} aria-label="Cases pagination">
          <div className={styles.paginationInfo}>
            Showing <strong>{startItem}</strong>–<strong>{endItem}</strong> of{" "}
            <strong>{total}</strong> {total === 1 ? "case" : "cases"}
          </div>

          <div className={styles.paginationActions}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || loading}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span style={{ fontSize: "0.875rem", padding: "0 0.5rem" }}>
              Page {page} of {Math.max(1, totalPages)}
            </span>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages || loading}
              aria-label="Next page"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
