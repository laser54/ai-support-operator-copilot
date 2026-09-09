import { useQuery } from "@tanstack/react-query";
import { Plus, ShieldAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { queryKeys } from "../api/queryKeys";
import { getCasesApi } from "../api/runtime";
import type { CaseQueueParams, CaseStatus, Priority } from "../api/types";
import { Button } from "../components/primitives/Button";
import { CasesQueue } from "../features/queue/CasesQueue";
import styles from "./QueuePage.module.css";

const VALID_STATUSES: CaseStatus[] = [
  "awaiting_human_review",
  "completed",
  "rejected",
  "received",
];

const VALID_PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];

export function QueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL params
  const rawStatus = searchParams.get("status");
  const statusFilter: CaseStatus | "" =
    rawStatus === "all"
      ? ""
      : rawStatus && VALID_STATUSES.includes(rawStatus as CaseStatus)
        ? (rawStatus as CaseStatus)
        : "awaiting_human_review";

  const rawPriority = searchParams.get("priority");
  const priorityFilter: Priority | "" =
    rawPriority && VALID_PRIORITIES.includes(rawPriority as Priority)
      ? (rawPriority as Priority)
      : "";

  const searchQuery = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 10;

  const queryParams: CaseQueueParams = {
    status: statusFilter,
    priority: priorityFilter,
    q: searchQuery,
    page,
    page_size: pageSize,
  };

  const queueQuery = useQuery({
    queryKey: queryKeys.casesList(queryParams),
    queryFn: () => getCasesApi().list(queryParams),
  });

  function updateParams(updates: Partial<{ status: string; priority: string; q: string; page: number }>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if ("status" in updates) {
          if (updates.status) {
            next.set("status", updates.status);
          } else {
            next.set("status", "all");
          }
          next.delete("page");
        }
        if ("priority" in updates) {
          if (updates.priority) {
            next.set("priority", updates.priority);
          } else {
            next.delete("priority");
          }
          next.delete("page");
        }
        if ("q" in updates) {
          if (updates.q?.trim()) {
            next.set("q", updates.q.trim());
          } else {
            next.delete("q");
          }
          next.delete("page");
        }
        if ("page" in updates) {
          if (updates.page && updates.page > 1) {
            next.set("page", String(updates.page));
          } else {
            next.delete("page");
          }
        }
        return next;
      },
      { replace: true },
    );
  }

  function handleResetFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const items = queueQuery.data?.items ?? [];
  const total = queueQuery.data?.total ?? 0;
  const totalPages = queueQuery.data?.total_pages ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>Cases Queue</h1>
            <p className={styles.subtitle}>
              Monitor incoming requests, inspect triage classification, and authorize safe mock incident actions.
            </p>
          </div>
          <Link to="/cases/new">
            <Button>
              <Plus size={16} aria-hidden="true" /> New case
            </Button>
          </Link>
        </div>

        <div className={styles.disclaimerBanner} role="note">
          <ShieldAlert size={14} className={styles.disclaimerDot} aria-hidden="true" />
          <span>Demo Queue · Synthetic Test Data Only · Policy Gate Write Protection · Zero Multi-Tenant Claims</span>
        </div>
      </header>

      <CasesQueue
        items={items}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        loading={queueQuery.isLoading || queueQuery.isFetching}
        error={queueQuery.error?.message}
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        searchQuery={searchQuery}
        onStatusChange={(status) => updateParams({ status })}
        onPriorityChange={(priority) => updateParams({ priority })}
        onSearchChange={(q) => updateParams({ q })}
        onPageChange={(nextPage) => updateParams({ page: nextPage })}
        onResetFilters={handleResetFilters}
        onRetry={() => void queueQuery.refetch()}
      />
    </div>
  );
}
