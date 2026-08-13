import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  Copy,
  Files,
  Plus,
  SquarePen,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

import { createApiClient } from "../api/client";
import { createCasesApi } from "../api/cases";
import { getApiBaseUrl } from "../api/runtime";
import type { ArtifactEntry, EvidenceSourceType } from "../api/types";
import { Badge } from "../components/primitives/Badge";
type BadgeTone = "neutral" | "review" | "warning" | "danger" | "success" | "evidence";
import { Button } from "../components/primitives/Button";
import { Card } from "../components/primitives/Card";
import { Dialog } from "../components/primitives/Dialog";
import { TextField } from "../components/primitives/TextField";
import { TextArea } from "../components/primitives/TextArea";
import { sampleArtifacts } from "../features/case-review/fixtures";
import fieldStyles from "../components/primitives/Field.module.css";
import styles from "./ArtifactsPage.module.css";

const SOURCE_ICONS = {
  knowledge: BookOpen,
  similar_case: Files,
  service_status: Activity,
};

const CATEGORY_LABELS: Record<EvidenceSourceType, string> = {
  knowledge: "Knowledge Runbook",
  similar_case: "Historical Incident",
  service_status: "Service Status Signal",
};

const BADGE_TONES: Record<EvidenceSourceType, BadgeTone> = {
  knowledge: "evidence",
  similar_case: "warning",
  service_status: "review",
};

export function ArtifactsPage() {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState<"all" | EvidenceSourceType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingArtifact, setEditingArtifact] = useState<ArtifactEntry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [artifactPendingDeletion, setArtifactPendingDeletion] = useState<ArtifactEntry | null>(null);

  // Form state
  const [formSourceType, setFormSourceType] = useState<EvidenceSourceType>("knowledge");
  const [formSourceId, setFormSourceId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formExcerpt, setFormExcerpt] = useState("");
  const [formKeywords, setFormKeywords] = useState("");

  const artifactsQuery = useQuery({
    queryKey: ["artifacts"],
    queryFn: async () => {
      try {
        const casesApi = createCasesApi(createApiClient({ baseUrl: getApiBaseUrl() }));
        return await casesApi.listArtifacts();
      } catch {
        return sampleArtifacts;
      }
    },
    initialData: sampleArtifacts,
  });

  const saveMutation = useMutation({
    mutationFn: async (entry: ArtifactEntry) => {
      try {
        const casesApi = createCasesApi(createApiClient({ baseUrl: getApiBaseUrl() }));
        return await casesApi.saveArtifact(entry);
      } catch {
        // Fallback in-memory mutation
        const existingIndex = sampleArtifacts.findIndex((item) => item.source_id === entry.source_id);
        if (existingIndex >= 0) {
          sampleArtifacts[existingIndex] = entry;
        } else {
          sampleArtifacts.push(entry);
        }
        return entry;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["artifacts"] });
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      try {
        const casesApi = createCasesApi(createApiClient({ baseUrl: getApiBaseUrl() }));
        await casesApi.deleteArtifact(sourceId);
      } catch {
        const index = sampleArtifacts.findIndex((item) => item.source_id === sourceId);
        if (index < 0) {
          throw new Error("Artifact was not found");
        }
        sampleArtifacts.splice(index, 1);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["artifacts"] });
      setArtifactPendingDeletion(null);
    },
  });

  const artifacts: ArtifactEntry[] = artifactsQuery.data ?? sampleArtifacts;

  const knowledgeCount = artifacts.filter((a: ArtifactEntry) => a.source_type === "knowledge").length;
  const incidentCount = artifacts.filter((a: ArtifactEntry) => a.source_type === "similar_case").length;
  const statusCount = artifacts.filter((a: ArtifactEntry) => a.source_type === "service_status").length;

  const filteredArtifacts = artifacts.filter((item: ArtifactEntry) => {
    if (filterType !== "all" && item.source_type !== filterType) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.source_id.toLowerCase().includes(q) ||
      item.excerpt.toLowerCase().includes(q) ||
      item.keywords.some((k: string) => k.toLowerCase().includes(q))
    );
  });

  function openCreateForm() {
    setEditingArtifact(null);
    setFormSourceType("knowledge");
    setFormSourceId(`kb-custom-${Date.now().toString().slice(-4)}`);
    setFormTitle("");
    setFormExcerpt("");
    setFormKeywords("sign in, 500 error");
    setIsCreating(true);
  }

  function openEditForm(artifact: ArtifactEntry) {
    setEditingArtifact(artifact);
    setFormSourceType(artifact.source_type);
    setFormSourceId(artifact.source_id);
    setFormTitle(artifact.title);
    setFormExcerpt(artifact.excerpt);
    setFormKeywords(artifact.keywords.join(", "));
    setIsCreating(true);
  }

  function closeForm() {
    setIsCreating(false);
    setEditingArtifact(null);
  }

  function handleSubmitForm(event: React.FormEvent) {
    event.preventDefault();
    const entry: ArtifactEntry = {
      source_type: formSourceType,
      source_id: formSourceId.trim() || `custom-${Date.now()}`,
      title: formTitle.trim() || "Untitled Artifact",
      excerpt: formExcerpt.trim() || "Synthetic excerpt.",
      keywords: formKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      observed_at: new Date().toISOString(),
    };
    saveMutation.mutate(entry);
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>Knowledge Catalog</h1>
            <p className={styles.subtitle}>
              Manage runbooks, historical incidents, and status signals searched by the AI Agent.
            </p>
          </div>
          <Button onClick={openCreateForm}>
            <Plus size={16} /> Add new artifact
          </Button>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statPill} data-type="knowledge">
            <BookOpen size={14} />
            <span>{knowledgeCount} Knowledge Runbooks</span>
          </div>
          <div className={styles.statPill} data-type="similar_case">
            <Files size={14} />
            <span>{incidentCount} Historical Incidents</span>
          </div>
          <div className={styles.statPill} data-type="service_status">
            <Activity size={14} />
            <span>{statusCount} Service Status Signals</span>
          </div>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="search"
            className={`input ${styles.searchInput}`}
            placeholder="Search titles, IDs, keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Artifact Category Filter">
          <button
            type="button"
            className={styles.tabBtn}
            data-active={filterType === "all"}
            onClick={() => setFilterType("all")}
          >
            All artifacts ({artifacts.length})
          </button>
          <button
            type="button"
            className={styles.tabBtn}
            data-active={filterType === "knowledge"}
            onClick={() => setFilterType("knowledge")}
          >
            Runbooks ({knowledgeCount})
          </button>
          <button
            type="button"
            className={styles.tabBtn}
            data-active={filterType === "similar_case"}
            onClick={() => setFilterType("similar_case")}
          >
            Incidents ({incidentCount})
          </button>
          <button
            type="button"
            className={styles.tabBtn}
            data-active={filterType === "service_status"}
            onClick={() => setFilterType("service_status")}
          >
            Status Signals ({statusCount})
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        {filteredArtifacts.map((item: ArtifactEntry) => {
          const Icon = SOURCE_ICONS[item.source_type] ?? BookOpen;
          const tone = BADGE_TONES[item.source_type] ?? "neutral";
          const cardTone = item.source_type === "knowledge" ? "evidence" : item.source_type === "similar_case" ? "facts" : "request";

          return (
            <Card key={item.source_id} tone={cardTone} className={styles.artifactCard}>
              <div className={styles.artifactHeader}>
                <Badge tone={tone}>{CATEGORY_LABELS[item.source_type]}</Badge>
                <div className={styles.cardActions}>
                  <Button
                    variant="secondary"
                    className={styles.editBtn}
                    onClick={() => openEditForm(item)}
                    aria-label={`Edit ${item.source_id}`}
                  >
                    <SquarePen size={13} /> Edit
                  </Button>
                  <Button
                    variant="danger"
                    className={styles.editBtn}
                    onClick={() => setArtifactPendingDeletion(item)}
                    aria-label={`Delete ${item.source_id}`}
                  >
                    <Trash2 size={13} /> Delete
                  </Button>
                </div>
              </div>

              <h2 className={styles.cardTitle}>{item.title}</h2>

              <div className={styles.sourceIdBadge}>
                <Icon size={13} />
                <span>{item.source_id}</span>
                <button
                  type="button"
                  style={{ background: "none", border: 0, cursor: "pointer", color: "inherit" }}
                  onClick={() => void copyText(item.source_id)}
                  title="Copy ID"
                >
                  <Copy size={12} />
                </button>
              </div>

              <p className={styles.excerpt}>{item.excerpt}</p>

              <div className={styles.keywordsRow}>
                <Sparkles size={12} style={{ color: "var(--color-text-muted)" }} />
                {item.keywords.map((kw: string) => (
                  <span key={kw} className={styles.keywordPill}>
                    {kw}
                  </span>
                ))}
              </div>

              <div className={styles.cardFooter}>
                <span>Observed {new Date(item.observed_at).toLocaleDateString()}</span>
                <span>ID: {item.source_id}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add / Edit Artifact Dialog */}
      <Dialog
        open={isCreating}
        title={editingArtifact ? `Edit Artifact: ${editingArtifact.source_id}` : "Add New Knowledge Artifact"}
        onClose={closeForm}
      >
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Configure titles, keywords, and excerpts queried by the AI Agent during case intake.
        </p>
        <form onSubmit={handleSubmitForm} className={styles.formGrid}>
          <div className={fieldStyles.field}>
            <label className={fieldStyles.label} htmlFor="artifact-type">
              Artifact Category
            </label>
            <select
              id="artifact-type"
              className={fieldStyles.control}
              value={formSourceType}
              onChange={(e) => setFormSourceType(e.target.value as EvidenceSourceType)}
            >
              <option value="knowledge">📘 Knowledge Runbook (kb-*)</option>
              <option value="similar_case">🚨 Historical Incident (inc-*)</option>
              <option value="service_status">⚡ Service Status Signal (status-*)</option>
            </select>
          </div>

          <TextField
            label="Source ID"
            hint="Unique slug (e.g. kb-auth-5xx-after-release)"
            value={formSourceId}
            onChange={(e) => setFormSourceId(e.target.value)}
            required
          />

          <TextField
            label="Artifact Title"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            required
          />

          <TextArea
            label="Excerpt / Runbook Body"
            hint="Synthetic runbook or signal description used by LLM"
            value={formExcerpt}
            onChange={(e) => setFormExcerpt(e.target.value)}
            required
          />

          <TextField
            label="Matching Keywords"
            hint="Comma-separated trigger keywords (e.g. 500 error, sign in, portal)"
            value={formKeywords}
            onChange={(e) => setFormKeywords(e.target.value)}
            required
          />

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
            <Button variant="secondary" onClick={closeForm} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={saveMutation.isPending}>
              Save artifact
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={artifactPendingDeletion !== null}
        title="Delete artifact?"
        busy={deleteMutation.isPending}
        onClose={() => setArtifactPendingDeletion(null)}
      >
        <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
          Delete <strong>{artifactPendingDeletion?.title}</strong>? This cannot be undone for the current demo session.
        </p>
        <div className={styles.dialogActions}>
          <Button
            variant="secondary"
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => setArtifactPendingDeletion(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            type="button"
            loading={deleteMutation.isPending}
            onClick={() => {
              if (artifactPendingDeletion) {
                deleteMutation.mutate(artifactPendingDeletion.source_id);
              }
            }}
          >
            Delete artifact
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
