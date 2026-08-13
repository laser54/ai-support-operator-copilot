import { useMemo, useState } from "react";

import styles from "./FilterTable.module.css";

export type TraceFilterCategory = "workflow" | "tools" | "human" | "execution";

export type FilterTableEvent = {
  id: string;
  category: TraceFilterCategory;
  label: string;
};

const FILTERS: Array<{ id: "all" | TraceFilterCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "workflow", label: "Workflow" },
  { id: "tools", label: "Tools" },
  { id: "human", label: "Human" },
  { id: "execution", label: "Execution" },
];

export function FilterTable({ events }: { events: FilterTableEvent[] }) {
  const [selected, setSelected] = useState<"all" | TraceFilterCategory>("all");

  const counts = useMemo(() => {
    const next = { all: events.length, workflow: 0, tools: 0, human: 0, execution: 0 };
    for (const event of events) {
      next[event.category] += 1;
    }
    return next;
  }, [events]);

  const visible = selected === "all" ? events : events.filter((event) => event.category === selected);

  return (
    <div>
      <div className={styles.filters} role="toolbar" aria-label="Trace filters">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={styles.chip}
            aria-pressed={selected === filter.id}
            onClick={() => setSelected(filter.id)}
          >
            {filter.label} {counts[filter.id]}
          </button>
        ))}
      </div>
      <ol className={styles.list}>
        {visible.map((event) => (
          <li className={styles.item} key={event.id}>
            {event.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
